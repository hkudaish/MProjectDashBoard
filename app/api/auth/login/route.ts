import { z } from "zod";
import { adminSessionCookie, canAdminLogin, createAdminSessionToken, hasSameOrigin } from "@/lib/admin-auth";
import { authenticateUser, publicUser } from "@/lib/user-accounts";
import { sessionInfo } from "@/lib/session-info";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "طلب تسجيل الدخول غير صالح." }, { status: 403 });
  if (!canAdminLogin()) return Response.json({ error: "لم يتم إعداد الدخول بعد." }, { status: 503 });
  const parsed = z.object({ email: z.string().max(254), password: z.string().max(128) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "بيانات الدخول غير صحيحة." }, { status: 400 });
  try {
    const account = await authenticateUser(parsed.data.email, parsed.data.password);
    if (!account) return Response.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب غير متاح مؤقتًا." }, { status: 401 });
    const token = createAdminSessionToken(account.email, account.sessionVersion);
    return Response.json(sessionInfo({ ...publicUser(account), sessionVersion: account.sessionVersion, expiresAt: 0 }), {
      headers: { "Cache-Control": "no-store", "Set-Cookie": adminSessionCookie(token) },
    });
  } catch { return Response.json({ error: "تعذر تسجيل الدخول. حاول مرة أخرى." }, { status: 503 }); }
}
