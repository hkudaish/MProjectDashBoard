import { getUserSession, getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { listActivity, deleteActivity, recordActivity } from "@/lib/activity-log";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await getUserSession(request.headers); if (!actor || actor.mustChangePassword) return Response.json({ error: "سجّل الدخول أولًا." }, { status: 403 });
  try { return Response.json({ entries: await listActivity(actor.email, actor.position === "system_admin") }, { headers: { "Cache-Control": "no-store" } }); } catch { return Response.json({ error: "تعذر قراءة السجل." }, { status: 503 }); }
}
export async function DELETE(request: Request) {
  const actor = await getSystemAdminSession(request.headers); if (!actor || !hasSameOrigin(request)) return Response.json({ error: "حذف السجل متاح لمدير النظام فقط." }, { status: 403 });
  const parsed = z.object({ id: z.string().uuid().optional() }).strict().safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "بيانات الحذف غير صالحة." }, { status: 400 });
  try { await deleteActivity(parsed.data.id); await recordActivity(actor, parsed.data.id ? "حذف عملية من السجل" : "مسح سجل العمليات", "سجل العمليات"); return Response.json({ ok: true }); } catch { return Response.json({ error: "تعذر حذف السجل." }, { status: 503 }); }
}
