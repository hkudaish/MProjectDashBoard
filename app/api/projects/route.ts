import { deleteResource } from "@/lib/resource-deletion";
import { withResourceAccess } from "@/lib/resource-access";
import { permitted, requireChanges, PermissionError } from "@/lib/permissions";
import { withActivity } from "@/lib/activity-log";
import { getUserSession, hasSameOrigin } from "@/lib/admin-auth";
import { EntityValidationError, validateEntityIds } from "@/lib/entity-store";
import { createProjectStore } from "@/lib/project-store";
import { projectInputSchema } from "@/lib/projects";
import { z } from "zod";
export async function GET(request?: Request) {
  try { const actor = await getUserSession(request?.headers ?? new Headers()); const projects = await createProjectStore().getProjects(); return Response.json({ projects: permitted(actor, "projects", "view") ? projects : projects.map(project => ({ id: project.id, name: project.name, description: "" })) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "تعذر تحميل المشاريع." }, { status: 500 }); }
}
async function handlePOST(request: Request) {
  if (!hasSameOrigin(request) || !(await getUserSession(request.headers))) return Response.json({ error: "إنشاء المشاريع متاح لمسؤول النظام فقط." }, { status: 403 });
  const parsed = projectInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    await validateEntityIds(parsed.data.entityIds ?? []);
    const store = createProjectStore(); const projects = await store.getProjects();
    if (projects.some((p) => p.name.normalize("NFKC") === parsed.data.name.normalize("NFKC"))) return Response.json({ error: "يوجد مشروع بهذا الاسم بالفعل." }, { status: 409 });
    const project = { id: crypto.randomUUID(), ...parsed.data };
    await store.setProjects([...projects, project]);
    return Response.json({ project }, { status: 201 });
  } catch (error) { if (error instanceof PermissionError) return Response.json({ error: error.message }, { status: 403 }); if (error instanceof EntityValidationError) return Response.json({ error: error.message }, { status: 400 }); return Response.json({ error: "تعذر حفظ المشروع." }, { status: 500 }); }
}
async function handlePATCH(request: Request) {
  if (!hasSameOrigin(request) || !(await getUserSession(request.headers))) return Response.json({ error: "تعديل المشاريع متاح لمسؤول النظام فقط." }, { status: 403 });
  const parsed = projectInputSchema.partial().extend({ id: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const store = createProjectStore(); const projects = await store.getProjects();
    const index = projects.findIndex((p) => p.id === parsed.data.id);
    if (index < 0) return Response.json({ error: "المشروع غير موجود." }, { status: 404 });
    if (projects.some((p) => p.id !== parsed.data.id && parsed.data.name !== undefined && p.name.normalize("NFKC") === parsed.data.name.normalize("NFKC"))) return Response.json({ error: "يوجد مشروع بهذا الاسم بالفعل." }, { status: 409 });
    await validateEntityIds(parsed.data.entityIds ?? projects[index].entityIds ?? [], projects[index].entityIds ?? []);
    const project = { ...projects[index], ...parsed.data }; const actor = await getUserSession(request.headers); if (!actor) return Response.json({ error: "سجّل الدخول أولًا." }, { status: 403 }); requireChanges(actor, "projects", projects[index], project); projects[index] = project;
    await store.setProjects(projects); return Response.json({ project });
  } catch (error) { if (error instanceof PermissionError) return Response.json({ error: error.message }, { status: 403 }); if (error instanceof EntityValidationError) return Response.json({ error: error.message }, { status: 400 }); return Response.json({ error: "تعذر تعديل المشروع." }, { status: 500 }); }
}

export const POST = withActivity("إضافة", withResourceAccess("projects", "create", handlePOST));

export const PATCH = withActivity("تعديل", withResourceAccess("projects", "change", handlePATCH));

export const DELETE = withActivity("حذف", withResourceAccess("projects", "delete", request => deleteResource(request, "projects")));
