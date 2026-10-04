import {
  adminSessionCookie,
  authenticateAdmin,
  canAdminLogin,
  createAdminSessionToken,
  hasSameOrigin,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return Response.json({ error: "طلب تسجيل الدخول غير صالح." }, { status: 403 });
  }
  if (!canAdminLogin()) {
    return Response.json({ error: "لم يتم إعداد دخول المسؤول بعد." }, { status: 503 });
  }

  let payload: { email?: unknown; password?: unknown };
  try {
    payload = await request.json() as { email?: unknown; password?: unknown };
  } catch {
    return Response.json({ error: "بيانات الدخول غير صحيحة." }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? payload.email : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!authenticateAdmin(email, password)) {
    return Response.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." }, { status: 401 });
  }

  const token = createAdminSessionToken(email);
  return Response.json(
    { isAdmin: true, email: email.trim().toLowerCase() },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": adminSessionCookie(token),
      },
    },
  );
}