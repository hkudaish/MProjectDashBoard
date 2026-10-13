import { findAccount } from "@/lib/user-accounts";
import { GMAIL_SCOPES, oauthReady, sameState, unseal, tokenRequest, verifyGmailAccount, saveRefreshToken } from "@/lib/gmail-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const home = redirectUri ? new URL("/settings/mail", redirectUri) : new URL("/settings/mail", request.url);
  let connected = false;
  try {
    if (!oauthReady()) throw new Error("Not configured");
    const params = new URL(request.url).searchParams;
    const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith("gmail_oauth_state="))?.slice("gmail_oauth_state=".length);
    if (!cookie || !params.get("state") || !params.get("code") || params.has("error")) throw new Error("Invalid callback");
    const state = unseal(cookie) as { state: string; verifier: string; email: string; sessionVersion: number; expiresAt: number };
    if (state.expiresAt < Date.now() || !sameState(params.get("state")!, state.state)) throw new Error("Invalid state");
    // The regular session cookie is SameSite=Strict. Verify the initiating admin
    // through the encrypted, short-lived Lax cookie on Google's redirect.
    const account = await findAccount(state.email);
    if (!account?.active || account.position !== "system_admin" || account.mustChangePassword || account.sessionVersion !== state.sessionVersion) throw new Error("Admin session changed");
    const tokens = await tokenRequest({ grant_type: "authorization_code", code: params.get("code")!, redirect_uri: redirectUri!, code_verifier: state.verifier });
    if (!tokens.refresh_token || !GMAIL_SCOPES.every(scope => tokens.scope?.split(" ").includes(scope))) throw new Error("Missing permission or offline access");
    await verifyGmailAccount(tokens.access_token);
    await saveRefreshToken(tokens.refresh_token);
    connected = true;
  } catch { /* Never expose Google tokens or authorization errors in URLs. */ }
  home.searchParams.set("gmail", connected ? "connected" : "error");
  return new Response(null, { status: 303, headers: { Location: home.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Set-Cookie": `gmail_oauth_state=; Path=/api/mailbox/callback; HttpOnly; SameSite=Lax; Max-Age=0${redirectUri?.startsWith("https:") ? "; Secure" : ""}` } });
}
