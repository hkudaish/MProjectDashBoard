import { addAdminEmail, getAdminSession, getAllAdminEmails, hasSameOrigin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getAdminSession(request.headers);
  if (!session) {
    return Response.json({ error: "يجب تسجيل الدخول بحساب مسؤول." }, { status: 401 });
  }

  return Response.json({ admins: await getAllAdminEmails() }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return Response.json({ error: "طلب إضافة المسؤول غير صالح." }, { status: 403 });
  }

  const session = await getAdminSession(request.headers);
  if (!session) {
    return Response.json({ error: "يجب تسجيل الدخول بحساب مسؤول." }, { status: 401 });
  }

  let payload: { email?: unknown };
  try {
    payload = await request.json() as { email?: unknown };
  } catch {
    return Response.json({ error: "بيانات البريد الإلكتروني غير صحيحة." }, { status: 400 });
  }

  if (typeof payload.email !== "string") {
    return Response.json({ error: "أدخل بريدًا إلكترونيًا صالحًا." }, { status: 400 });
  }

  try {
    const admins = await addAdminEmail(payload.email);
    return Response.json({ admins }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذرت إضافة المسؤول.";
    const status = message === "أدخل بريدًا إلكترونيًا صالحًا." ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}