import { getUserSession } from "./admin-auth";
import { createProjectStore } from "./project-store";
import { createProductStore } from "./product-store";
import { createTaskStore } from "./task-store";
import { listUsers } from "./user-accounts";
import { taskPermissions } from "./task-assignment";
import { DEFAULT_TASKS } from "./task-data";
import { readRecord } from "./versioned-store";
import { z } from "zod";
import type { Resource } from "./permissions";
import type { Task } from "./types";
export async function deleteResource(request: Request, resource: Resource) {
  const actor = await getUserSession(request.headers); if (!actor) return Response.json({ error: "سجّل الدخول أولًا." }, { status: 403 });
  const parsed = z.object({ id: z.string().min(1).max(120) }).strict().safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "حدد العنصر المطلوب حذفه." }, { status: 400 });
  try {
    const id = parsed.data.id;
    const taskStore = createTaskStore(); const stored = await taskStore.getTasks(); const tasks = stored.length || await taskStore.hasStoredTasks?.() ? stored : DEFAULT_TASKS as Task[];
    if (resource === "tasks") {
      const task = tasks.find(item => item.id === id); if (!task) return Response.json({ error: "المهمة غير موجودة." }, { status: 404 });
      if (!taskPermissions(actor, task, await listUsers()).canDelete) return Response.json({ error: "الحذف خارج صلاحياتك أو نطاقك الإداري." }, { status: 403 });
      await taskStore.setTasks(tasks.filter(item => item.id !== id));
    } else if (resource === "products") {
      const store = createProductStore(); const values = await store.getProducts(); const item = values.find(value => value.id === id); if (!item) return Response.json({ error: "المنتج غير موجود." }, { status: 404 });
      if (tasks.some(task => task.productId === id)) return Response.json({ error: "المنتج مرتبط بمهام. احذف المهام أو انقلها قبل حذف المنتج." }, { status: 409 });
      await store.setProducts(values.map(value => value.id === id ? { ...value, deleted: true } : value));
    } else {
      const store = createProjectStore(); const values = await store.getProjects(); const item = values.find(value => value.id === id); if (!item) return Response.json({ error: "المشروع غير موجود." }, { status: 404 });
      const [products, users, registrations] = await Promise.all([createProductStore().getProducts(), listUsers(), readRecord<{ projectId?: string; status: string }[]>("registration-requests-v1", [])]);
      if (products.some(product => (product.projectId ?? "media-project") === id) || users.some(user => user.projectId === id) || registrations.some(row => row.projectId === id && ["pending", "approved", "on_hold"].includes(row.status))) return Response.json({ error: "المشروع مرتبط بمنتجات أو مستخدمين أو طلبات تسجيل. عدّل ارتباطاتها قبل الحذف." }, { status: 409 });
      await store.setProjects(values.map(value => value.id === id ? { ...value, deleted: true } : value));
    }
    return Response.json({ deleted: true });
  } catch { return Response.json({ error: "تعذر الحذف." }, { status: 503 }); }
}
