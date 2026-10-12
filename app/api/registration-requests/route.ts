import { withActivity } from "@/lib/activity-log";
import { getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { registrationInputSchema, reviewInputSchema, submitRegistration, listRegistrations, reviewRegistration, flushRegistrationEmails, registrationMailConfigured, registrationMailMode, RegistrationError } from "@/lib/registration-requests";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!(await getSystemAdminSession(request.headers))) return Response.json({ error: "مراجعة الطلبات متاحة لمدير النظام فقط." }, { status: 403 });
  return Response.json({ requests: await listRegistrations(), mailConfigured: await registrationMailConfigured(), mailMode: await registrationMailMode() }, { headers: { "Cache-Control": "no-store" } });
}
async function handlePOST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const parsed = registrationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "أكمل الحقول المطلوبة وأدخل بريدًا إلكترونيًا صالحًا." }, { status: 400 });
  try { await submitRegistration(parsed.data); return Response.json({ message: "شكرًا لك! تم استلام طلبك لمراجعته من مدير النظام. سيتم إشعارك عبر البريد الإلكتروني بنتيجة المراجعة." }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof RegistrationError ? error.message : "تعذر حفظ الطلب. حاول مرة أخرى." }, { status: error instanceof RegistrationError ? 400 : 503 }); }
}
async function handlePATCH(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const session = await getSystemAdminSession(request.headers);
  if (!session) return Response.json({ error: "المراجعة متاحة لمدير النظام فقط." }, { status: 403 });
  const parsed = reviewInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "بيانات المراجعة غير صالحة." }, { status: 400 });
  try { return Response.json({ request: await reviewRegistration(parsed.data, session.email) }); }
  catch (error) { return Response.json({ error: error instanceof RegistrationError ? error.message : "تعذر حفظ القرار." }, { status: 400 }); }
}
async function handlePUT(request: Request) {
  if (!hasSameOrigin(request) || !(await getSystemAdminSession(request.headers))) return Response.json({ error: "الإجراء متاح لمدير النظام فقط." }, { status: 403 });
  await flushRegistrationEmails();
  return Response.json({ mailConfigured: await registrationMailConfigured() });
}

export const POST = withActivity("إضافة", handlePOST);

export const PATCH = withActivity("تعديل", handlePATCH);

export const PUT = withActivity("إعادة إرسال الإشعارات", handlePUT);
