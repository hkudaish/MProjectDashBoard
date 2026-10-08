import { taskInputSchema, taskTitleSchema } from "@/lib/products";
import { createProductStore } from "@/lib/product-store";
import { DEFAULT_TASKS } from "@/lib/task-data";
import { createTaskStore } from "@/lib/task-store";
import { getAdminSession } from "@/lib/admin-auth";
import type { Task } from "@/lib/types";
import { taskDetailsSchema } from "@/lib/task-details";
import { progressForStatus } from "@/lib/task-progress";

const VALID_STATUSES = new Set(["not_started", "in_progress", "review", "completed", "blocked"]);
const VALID_OWNERS = new Set(["wamy", "vendor", "joint", "unassigned"]);

function seedTasks(): Task[] {
  const updatedAt = new Date().toISOString();
  return DEFAULT_TASKS.map((task) => ({ ...task, updatedAt })) as Task[];
}

async function readTasks() {
  const store = createTaskStore();
  const existing = await store.getTasks();
  if (existing.length > 0) return { store, tasks: existing };

  const tasks = seedTasks();
  await store.setTasks(tasks);
  return { store, tasks };
}

export async function GET() {
  try {
    const { tasks } = await readTasks();
    const products = await createProductStore().getProducts();
    const productNames = new Map(products.map((p) => [p.id, p.name]));
    const sorted = tasks.map((task) => ({ ...task, productName: productNames.get(task.productId) ?? task.productName, progress: progressForStatus(task.status, task.progress) })).sort((a, b) =>
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

export async function PATCH(request: Request) {
  try {
    if (!(await getAdminSession(request.headers))) {
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
      if (!VALID_OWNERS.has(payload.ownerType)) return Response.json({ error: "جهة الإسناد غير صحيحة." }, { status: 400 });
      update.ownerType = payload.ownerType;
    }
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

    const updated = { ...tasks[index], ...update } as Task;
    updated.productName = (await createProductStore().getProducts()).find((p) => p.id === updated.productId)?.name ?? updated.productName;
    updated.progress = progressForStatus(updated.status, updated.progress);
    const nextTasks = [...tasks];
    nextTasks[index] = updated;
    await store.setTasks(nextTasks);
    return Response.json({ task: updated });
  } catch (error) {
    console.error("PATCH /api/tasks failed", error);
    const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await getAdminSession(request.headers))) return Response.json({ error: "يجب تسجيل الدخول بحساب مسؤول." }, { status: 401 });
  const parsed = taskInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const product = (await createProductStore().getProducts()).find((item) => item.id === parsed.data.productId);
    if (!product) return Response.json({ error: "المنتج المحدد غير موجود." }, { status: 400 });
    const { store, tasks } = await readTasks();
    const task: Task = { ...parsed.data, id: crypto.randomUUID(), productName: product.name,
      progress: progressForStatus(parsed.data.status, parsed.data.progress),
      sourceOrder: Math.max(0, ...tasks.map((item) => item.sourceOrder)) + 1, updatedAt: new Date().toISOString() };
    await store.setTasks([...tasks, task]);
    return Response.json({ task }, { status: 201 });
  } catch { return Response.json({ error: "تعذر حفظ المهمة." }, { status: 500 }); }
}
