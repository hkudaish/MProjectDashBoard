import type { Task } from "@/lib/types";
import { getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { createEntityStore, entityInputSchema } from "@/lib/entity-store";
import { createTaskStore } from "@/lib/task-store";
import { createProjectStore } from "@/lib/project-store";
import { createProductStore } from "@/lib/product-store";
import { listUsers } from "@/lib/user-accounts";
import { DEFAULT_TASKS } from "@/lib/task-data";
import { z } from "zod";
export async function GET(request: Request) {
  try { const admin = await getSystemAdminSession(request.headers); const entities = (await createEntityStore().getEntities()).filter((entity) => !entity.deleted && (admin || !entity.hidden)); return Response.json({ entities }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "تعذر تحميل الجهات." }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request) || !(await getSystemAdminSession(request.headers))) return Response.json({ error: "إدارة الجهات متاحة لمدير النظام فقط." }, { status: 403 });
  const parsed = entityInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try { const store = createEntityStore(); const entities = await store.getEntities(); if (entities.some((entity) => !entity.deleted && entity.name.normalize("NFKC") === parsed.data.name.normalize("NFKC"))) return Response.json({ error: "يوجد جهة بهذا الاسم بالفعل." }, { status: 409 }); const entity = { id: crypto.randomUUID(), ...parsed.data, hidden: false }; await store.setEntities([...entities, entity]); return Response.json({ entity }, { status: 201 }); }
  catch { return Response.json({ error: "تعذر حفظ الجهة." }, { status: 500 }); }
}
export async function PATCH(request: Request) {
  if (!hasSameOrigin(request) || !(await getSystemAdminSession(request.headers))) return Response.json({ error: "إدارة الجهات متاحة لمدير النظام فقط." }, { status: 403 });
  const parsed = entityInputSchema.partial().extend({ id: z.string().min(1), hidden: z.boolean().optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try { const store = createEntityStore(); const entities = await store.getEntities(); const index = entities.findIndex((entity) => entity.id === parsed.data.id && !entity.deleted); if (index < 0) return Response.json({ error: "الجهة غير موجودة." }, { status: 404 }); const entity = { ...entities[index], ...parsed.data }; if (entities.some((item) => !item.deleted && item.id !== entity.id && item.name.normalize("NFKC") === entity.name.normalize("NFKC"))) return Response.json({ error: "يوجد جهة بهذا الاسم بالفعل." }, { status: 409 }); entities[index] = entity; await store.setEntities(entities); return Response.json({ entity }); }
  catch { return Response.json({ error: "تعذر تعديل الجهة." }, { status: 500 }); }
}
export async function DELETE(request: Request) {
  if (!hasSameOrigin(request) || !(await getSystemAdminSession(request.headers))) return Response.json({ error: "إدارة الجهات متاحة لمدير النظام فقط." }, { status: 403 });
  const parsed = z.object({ id: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "معرّف الجهة مطلوب." }, { status: 400 });
  try {
    const store = createEntityStore(); const entities = await store.getEntities(); const index = entities.findIndex((entity) => entity.id === parsed.data.id && !entity.deleted);
    if (index < 0) return Response.json({ error: "الجهة غير موجودة." }, { status: 404 });
    const [users, storedTasks, projects, products] = await Promise.all([listUsers(), createTaskStore().getTasks(), createProjectStore().getProjects(), createProductStore().getProducts()]);
    const tasks = storedTasks.length ? storedTasks : DEFAULT_TASKS as Task[];
    const id = parsed.data.id;
    if (users.some((user) => user.entityId === id) || tasks.some((task) => task.ownerType === id || task.details?.some((detail) => detail.ownerType === id)) || projects.some((project) => project.entityIds?.includes(id)) || products.some((product) => product.details?.some((detail) => detail.ownerType === id))) return Response.json({ error: "الجهة مرتبطة ببيانات قائمة. استخدم الحجب، أو عدّل ارتباطاتها قبل حذفها." }, { status: 409 });
    entities[index] = { ...entities[index], hidden: true, deleted: true }; await store.setEntities(entities); return Response.json({ deleted: true });
  } catch { return Response.json({ error: "تعذر حذف الجهة." }, { status: 500 }); }
}
