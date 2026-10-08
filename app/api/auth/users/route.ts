import { getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { createUser, createUserSchema, emailSchema, listUsers, passwordSchema, updateUser } from "@/lib/user-accounts";
import { z } from "zod";
export const dynamic = "force-dynamic";
const patchSchema = z.object({ email: emailSchema, role: z.enum(["admin", "editor", "viewer"]).optional(), active: z.boolean().optional(), temporaryPassword: passwordSchema.optional() }).refine((v) => v.role !== undefined || v.active !== undefined || v.temporaryPassword !== undefined, "اختر التعديل المطلوب.");
export async function GET(request: Request) {
  if (!(await getSystemAdminSession(request.headers))) return Response.json({ error: "إدارة الحسابات متاحة لمسؤول النظام بعد تغيير كلمة المرور." }, { status: 403 });
  try { return Response.json({ users: await listUsers() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "تعذر تحميل المستخدمين." }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  if (!(await getSystemAdminSession(request.headers))) return Response.json({ error: "إضافة الحسابات متاحة لمسؤول النظام بعد تغيير كلمة المرور." }, { status: 403 });
  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try { return Response.json({ user: await createUser(parsed.data) }, { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error && error.message === "يوجد حساب بهذا البريد الإلكتروني بالفعل." ? error.message : "تعذر إنشاء الحساب." }, { status: 400 }); }
}
export async function PATCH(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const session = await getSystemAdminSession(request.headers);
  if (!session) return Response.json({ error: "تعديل الحسابات متاح لمسؤول النظام بعد تغيير كلمة المرور." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const { email, ...changes } = parsed.data;
  try { return Response.json({ user: await updateUser(email, session.email, changes) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    const allowed = ["الحساب غير موجود.", "لا يمكنك تعطيل حسابك أو تغيير صلاحياتك بنفسك.", "يجب الإبقاء على مسؤول نظام نشط واحد على الأقل."];
    return Response.json({ error: error instanceof Error && allowed.includes(error.message) ? error.message : "تعذر تعديل الحساب." }, { status: 400 });
  }
}
