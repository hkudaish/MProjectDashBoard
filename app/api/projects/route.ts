import { getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { createProjectStore } from "@/lib/project-store";
import { projectInputSchema } from "@/lib/projects";
import { z } from "zod";
export async function GET() {
  try { return Response.json({ projects: await createProjectStore().getProjects() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "تعذر تحميل المشاريع." }, { status: 500 }); }
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request) || !(await getSystemAdminSession(request.headers))) return Response.json({ error: "إنشاء المشاريع متاح لمسؤول النظام فقط." }, { status: 403 });
  const parsed = projectInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const store = createProjectStore(); const projects = await store.getProjects();
    if (projects.some((p) => p.name.normalize("NFKC") === parsed.data.name.normalize("NFKC"))) return Response.json({ error: "يوجد مشروع بهذا الاسم بالفعل." }, { status: 409 });
    const project = { id: crypto.randomUUID(), ...parsed.data };
    await store.setProjects([...projects, project]);
    return Response.json({ project }, { status: 201 });
  } catch { return Response.json({ error: "تعذر حفظ المشروع." }, { status: 500 }); }
}
export async function PATCH(request: Request) {
  if (!hasSameOrigin(request) || !(await getSystemAdminSession(request.headers))) return Response.json({ error: "تعديل المشاريع متاح لمسؤول النظام فقط." }, { status: 403 });
  const parsed = projectInputSchema.extend({ id: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const store = createProjectStore(); const projects = await store.getProjects();
    const index = projects.findIndex((p) => p.id === parsed.data.id);
    if (index < 0) return Response.json({ error: "المشروع غير موجود." }, { status: 404 });
    if (projects.some((p) => p.id !== parsed.data.id && p.name.normalize("NFKC") === parsed.data.name.normalize("NFKC"))) return Response.json({ error: "يوجد مشروع بهذا الاسم بالفعل." }, { status: 409 });
    const project = { ...projects[index], ...parsed.data }; projects[index] = project;
    await store.setProjects(projects); return Response.json({ project });
  } catch { return Response.json({ error: "تعذر تعديل المشروع." }, { status: 500 }); }
}
