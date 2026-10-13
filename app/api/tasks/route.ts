import { deleteResource } from "@/lib/resource-deletion";
import { withResourceAccess } from "@/lib/resource-access";
import { permitted, requireChanges, PermissionError } from "@/lib/permissions";
import { withActivity } from "@/lib/activity-log";
import { listUsers } from "@/lib/user-accounts";
import { createEntityStore } from "@/lib/entity-store";
import { normalizeTaskAssignments, taskPermissions, TaskPolicyError } from "@/lib/task-assignment";
import { OWNER_LABELS } from "@/lib/types";
import { taskInputSchema, taskTitleSchema } from "@/lib/products";
import { createProductStore } from "@/lib/product-store";
import { DEFAULT_TASKS } from "@/lib/task-data";
import { createTaskStore, TaskConflictError } from "@/lib/task-store";
import { getUserSession } from "@/lib/admin-auth";
import type { Task } from "@/lib/types";
import { taskDetailsSchema } from "@/lib/task-details";
import { progressForStatus } from "@/lib/task-progress";

const VALID_STATUSES = new Set(["not_started", "in_progress", "review", "completed", "blocked"]);

function seedTasks(): Task[] {
  const updatedAt = new Date().toISOString();
  return DEFAULT_TASKS.map((task) => ({ ...task, updatedAt })) as Task[];
}

async function readTasks() {
  const store = createTaskStore();
  const existing = await store.getTasks();
  if (existing.length > 0 || await store.hasStoredTasks?.()) return { store, tasks: existing };

  const tasks = seedTasks();
  await store.setTasks(tasks);
  return { store, tasks };
}

export async function GET(request?: Request) {
  try {
    const actor = await getUserSession(request?.headers ?? new Headers());
    if (!permitted(actor, "tasks", "view")) return Response.json({ tasks: [] }, { headers: { "Cache-Control": "no-store" } });
    const { tasks } = await readTasks();
    const products = await createProductStore().getProducts();
    const productNames = new Map(products.map((p) => [p.id, p.name]));
    const session = actor;
    const activeSession = session && !session.mustChangePassword ? session : null;
    const users = activeSession || tasks.some((task) => task.assigneeEmail || task.details?.some((detail) => detail.assigneeEmail)) ? await listUsers() : [];
    const entities = await createEntityStore().getEntities();
    const names = new Map(entities.map((entity) => [entity.id, entity.name]));
    const displayOwner = (ownerType: string) => names.has(ownerType) && names.get(ownerType) !== OWNER_LABELS[ownerType] ? { ownerName: names.get(ownerType)! } : {};
    const displayed = tasks.map((task) => {
      const next = { ...task, projectId: products.find(product => product.id === task.productId)?.projectId ?? "media-project", ...displayOwner(task.ownerType), ...(task.assigneeEmail ? { assignee: users.find((user) => user.email === task.assigneeEmail)?.name ?? task.assignee } : {}),
        ...(task.details ? { details: task.details.map((detail) => ({ ...detail, ...displayOwner(detail.ownerType), ...(detail.assigneeEmail ? { assignee: users.find((user) => user.email === detail.assigneeEmail)?.name ?? detail.assignee } : {}) })) } : {}),
        ...(activeSession ? { permissions: taskPermissions(activeSession, task, users) } : {}) };
      if (!activeSession) { delete next.assigneeEmail; delete next.createdByEmail; next.details?.forEach((detail) => { delete detail.assigneeEmail; }); }
      return next;
    });
    const sorted = displayed.map((task) => ({ ...task, productName: productNames.get(task.productId) ?? task.productName, progress: progressForStatus(task.status, task.progress) })).sort((a, b) =>
      a.plannedDate.localeCompare(b.plannedDate) ||
      a.productId.localeCompare(b.productId) ||
      a.sourceOrder - b.sourceOrder
    );
    return Response.json({ tasks: sorted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/tasks failed", error);
    const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handlePATCH(request: Request) {
  try {
    const session = await getUserSession(request.headers);
    if (!session || session.mustChangePassword) {
      return Response.json({ error: "يجب تسجيل الدخول بحساب مسؤول لتعديل البيانات." }, { status: 401 });
    }
    const payload = (await request.json()) as Record<string, unknown>;
    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id) return Response.json({ error: "معرّف المهمة مطلوب." }, { status: 400 });

    const update: Partial<Task> = { updatedAt: new Date().toISOString() };

    if ("details" in payload) {
      const details = taskDetailsSchema.safeParse(payload.details);
      if (!details.success) {
        return Response.json({ error: details.error.issues[0]?.message || "تفاصيل المهمة غير صحيحة." }, { status: 400 });
      }
      update.details = details.data;
    }

    if (typeof payload.status === "string") {
      if (!VALID_STATUSES.has(payload.status)) return Response.json({ error: "حالة المهمة غير صحيحة." }, { status: 400 });
      update.status = payload.status as Task["status"];
    }
    if (typeof payload.progress === "number") {
      update.progress = Math.max(0, Math.min(100, Math.round(payload.progress)));
    }
    if (typeof payload.ownerType === "string") {
      if (!payload.ownerType.trim() || payload.ownerType.length > 120) return Response.json({ error: "جهة الإسناد غير صحيحة." }, { status: 400 });
      update.ownerType = payload.ownerType;
    }
    if ("assigneeEmail" in payload) { if (typeof payload.assigneeEmail !== "string") return Response.json({ error: "المستخدم غير صحيح." }, { status: 400 }); update.assigneeEmail = payload.assigneeEmail; }
    if (typeof payload.assignee === "string") update.assignee = payload.assignee.trim().slice(0, 120);
    if (typeof payload.notes === "string") update.notes = payload.notes.trim().slice(0, 1200);
    if ("title" in payload) {
      const title = taskTitleSchema.safeParse(payload.title);
      if (!title.success) return Response.json({ error: title.error.issues[0]?.message }, { status: 400 });
      update.title = title.data;
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof payload.plannedDate === "string" && datePattern.test(payload.plannedDate)) update.plannedDate = payload.plannedDate;
    if (typeof payload.endDate === "string" && datePattern.test(payload.endDate)) update.endDate = payload.endDate;

    const { store, tasks } = await readTasks();
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return Response.json({ error: "لم يتم العثور على المهمة." }, { status: 404 });
    if ("expectedUpdatedAt" in payload && (typeof payload.expectedUpdatedAt !== "string" || payload.expectedUpdatedAt !== tasks[index].updatedAt)) return Response.json({ error: "تغيّرت المهمة بعد آخر قراءة. حدّث البيانات وراجع التغييرات قبل الحفظ أو التراجع." }, { status: 409 });
    update.updatedAt = new Date(Math.max(Date.now(), (Date.parse(tasks[index].updatedAt) || 0) + 1)).toISOString();

    requireChanges(session, "tasks", tasks[index], { ...tasks[index], ...update });
    const updated = await normalizeTaskAssignments(session, { ...tasks[index], ...update } as Task, tasks[index]);
    updated.productName = (await createProductStore().getProducts()).find((p) => p.id === updated.productId)?.name ?? updated.productName;
    updated.progress = progressForStatus(updated.status, updated.progress);
    const nextTasks = [...tasks];
    nextTasks[index] = updated;
    if (store.updateTask) await store.updateTask(updated, tasks[index].updatedAt); else await store.setTasks(nextTasks);
    return Response.json({ task: { ...updated, permissions: taskPermissions(session, updated, await listUsers()) } });
  } catch (error) {
    if (error instanceof TaskConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof PermissionError) return Response.json({ error: error.message }, { status: 403 });
    if (error instanceof TaskPolicyError) return Response.json({ error: error.message }, { status: error.status });
    console.error("PATCH /api/tasks failed", error);
    const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handlePOST(request: Request) {
  const session = await getUserSession(request.headers);
  if (!session) return Response.json({ error: "يجب تسجيل الدخول بحساب مسؤول." }, { status: 401 });
  const parsed = taskInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const product = (await createProductStore().getProducts()).find((item) => item.id === parsed.data.productId);
    if (!product) return Response.json({ error: "المنتج المحدد غير موجود." }, { status: 400 });
    const { store, tasks } = await readTasks();
    const task: Task = await normalizeTaskAssignments(session, { ...parsed.data, createdByEmail: session.email, id: crypto.randomUUID(), productName: product.name,
      progress: progressForStatus(parsed.data.status, parsed.data.progress),
      sourceOrder: Math.max(0, ...tasks.map((item) => item.sourceOrder)) + 1, updatedAt: new Date().toISOString() });
    await store.setTasks([...tasks, task]);
    return Response.json({ task: { ...task, permissions: taskPermissions(session, task, await listUsers()) } }, { status: 201 });
  } catch (error) { if (error instanceof PermissionError) return Response.json({ error: error.message }, { status: 403 }); if (error instanceof TaskPolicyError) return Response.json({ error: error.message }, { status: error.status }); return Response.json({ error: "تعذر حفظ المهمة." }, { status: 500 }); }
}

export const PATCH = withActivity("تعديل", withResourceAccess("tasks", "change", handlePATCH));

export const POST = withActivity("إضافة", withResourceAccess("tasks", "create", handlePOST));

export const DELETE = withActivity("حذف", withResourceAccess("tasks", "delete", request => deleteResource(request, "tasks")));
