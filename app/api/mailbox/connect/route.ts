import { withActivity } from "@/lib/activity-log";
import { randomBytes, createHash } from "node:crypto";
import { getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { GMAIL_SCOPES, gmailAddress, oauthReady, seal } from "@/lib/gmail-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handlePOST(request: Request) {
  const admin = await getSystemAdminSession(request.headers);
  if (!admin || !hasSameOrigin(request)) return Response.json({ error: "الإجراء متاح لمدير النظام فقط." }, { status: 403 });
  if (!oauthReady()) return Response.json({ error: "أضف بيانات Google OAuth في إعدادات الخادم أولًا." }, { status: 503 });
  const state = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url");
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  if (new URL(redirectUri).origin !== request.headers.get("origin")) return Response.json({ error: "افتح التطبيق من العنوان المعتمد في GOOGLE_REDIRECT_URI لإكمال ربط Google." }, { status: 400 });
  const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri, response_type: "code", scope: GMAIL_SCOPES.join(" "), access_type: "offline", prompt: "consent", state, login_hint: gmailAddress(), code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") });
  const cookie = seal({ state, verifier, email: admin.email, sessionVersion: admin.sessionVersion, expiresAt: Date.now() + 600000 });
  return Response.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `gmail_oauth_state=${cookie}; Path=/api/mailbox/callback; HttpOnly; SameSite=Lax; Max-Age=600${redirectUri.startsWith("https:") ? "; Secure" : ""}` } });
}

export const POST = withActivity("بدء ربط Google", handlePOST);
