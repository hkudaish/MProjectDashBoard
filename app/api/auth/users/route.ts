import { adminSessionCookie, createAdminSessionToken, getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { createUser, createUserSchema, listUsers, updateUserSchema, HIERARCHY_ERRORS, ACCOUNT_ERRORS, deleteUser, emailSchema, findAccount, updateUser } from "@/lib/user-accounts";
export const dynamic = "force-dynamic";
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
  catch (error) { return Response.json({ error: error instanceof Error && (error.message === "يوجد حساب بهذا البريد الإلكتروني بالفعل." || HIERARCHY_ERRORS.includes(error.message)) ? error.message : "تعذر إنشاء الحساب." }, { status: 400 }); }
}
export async function PATCH(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const session = await getSystemAdminSession(request.headers);
  if (!session) return Response.json({ error: "تعديل الحسابات متاح لمسؤول النظام بعد تغيير كلمة المرور." }, { status: 403 });
  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const { email, ...changes } = parsed.data;
  try {
    const user = await updateUser(email, session.email, changes);
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (email === session.email) { const account = await findAccount(email); if (account) headers["Set-Cookie"] = adminSessionCookie(createAdminSessionToken(email, account.sessionVersion)); }
    return Response.json({ user }, { headers });
  }
  catch (error) {
    const allowed = [...HIERARCHY_ERRORS, ...ACCOUNT_ERRORS, "الحساب غير موجود.", "لا يمكنك تعطيل حسابك أو تغيير صلاحياتك بنفسك.", "يجب الإبقاء على مسؤول نظام نشط واحد على الأقل."];
    return Response.json({ error: error instanceof Error && allowed.includes(error.message) ? error.message : "تعذر تعديل الحساب." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const session = await getSystemAdminSession(request.headers);
  if (!session) return Response.json({ error: "حذف الحسابات متاح لمدير النظام فقط." }, { status: 403 });
  const payload = await request.json().catch(() => null) as { email?: unknown } | null;
  const parsed = emailSchema.safeParse(payload?.email);
  if (!parsed.success) return Response.json({ error: "حدد حساب المستخدم." }, { status: 400 });
  try { return Response.json(await deleteUser(parsed.data, session.email), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { const allowed = [...ACCOUNT_ERRORS, "الحساب غير موجود.", "يجب الإبقاء على مسؤول نظام نشط واحد على الأقل."]; return Response.json({ error: error instanceof Error && allowed.includes(error.message) ? error.message : "تعذر حذف الحساب." }, { status: 400 }); }
}
