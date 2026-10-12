import { z } from "zod";
import { getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { listUsers, findAccount, updateUser, emailSchema } from "@/lib/user-accounts";
import { permissionsSchema, permissionsFor } from "@/lib/permissions";
import { recordActivity } from "@/lib/activity-log";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!(await getSystemAdminSession(request.headers))) return Response.json({ error: "إدارة الصلاحيات متاحة لمدير النظام فقط." }, { status: 403 });
  try { return Response.json({ users: (await listUsers()).map(user => ({ ...user, effectivePermissions: permissionsFor(user) })) }, { headers: { "Cache-Control": "no-store" } }); } catch { return Response.json({ error: "تعذر تحميل الصلاحيات." }, { status: 503 }); }
}
export async function PATCH(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const actor = await getSystemAdminSession(request.headers); if (!actor) return Response.json({ error: "إدارة الصلاحيات متاحة لمدير النظام فقط." }, { status: 403 });
  const parsed = z.object({ email: emailSchema, permissions: permissionsSchema.nullable() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "بيانات الصلاحيات غير صالحة." }, { status: 400 });
  const target = await findAccount(parsed.data.email); if (!target) return Response.json({ error: "المستخدم غير موجود." }, { status: 404 });
  if (target.position === "system_admin") return Response.json({ error: "مدير النظام يحتفظ بجميع الصلاحيات." }, { status: 403 });
  try { await updateUser(target.email, actor.email, { resourcePermissions: parsed.data.permissions }); await recordActivity(actor, "تحديث صلاحيات المستخدم", `${target.name} (${target.loginEmail})`); return Response.json({ ok: true }); } catch { return Response.json({ error: "تعذر حفظ الصلاحيات." }, { status: 503 }); }
}
