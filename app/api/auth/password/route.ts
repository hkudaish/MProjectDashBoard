import { z } from "zod";
import { adminSessionCookie, createAdminSessionToken, getUserSession, hasSameOrigin } from "@/lib/admin-auth";
import { changeUserPassword, passwordSchema, publicUser } from "@/lib/user-accounts";
import { sessionInfo } from "@/lib/session-info";
export const dynamic = "force-dynamic";
const schema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const session = await getUserSession(request.headers);
  if (!session) return Response.json({ error: "سجّل الدخول أولًا." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const account = await changeUserPassword(session.email, session.sessionVersion, parsed.data.currentPassword, parsed.data.newPassword);
    const token = createAdminSessionToken(account.email, account.sessionVersion);
    return Response.json(sessionInfo({ ...publicUser(account), expiresAt: 0, sessionVersion: account.sessionVersion }), { headers: { "Cache-Control": "no-store", "Set-Cookie": adminSessionCookie(token) } });
  } catch (error) {
    const messages = ["كلمة المرور الحالية غير صحيحة أو انتهت الجلسة.", "اختر كلمة مرور مختلفة عن كلمة المرور الحالية.", "انتهت الجلسة. سجّل الدخول مجددًا."];
    return Response.json({ error: error instanceof Error && messages.includes(error.message) ? error.message : "تعذر تغيير كلمة المرور." }, { status: 400 });
  }
}
