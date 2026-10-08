import { createHmac, timingSafeEqual } from "node:crypto";
import { authenticateUser, findAccount, publicUser } from "./user-accounts";
import { isManager } from "./hierarchy";
import type { UserSession } from "./user-types";
export { normalizeAdminEmail, getAllAdminEmails } from "./legacy-admins";

const COOKIE_NAME = "task_admin_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
export type AdminSession = UserSession;
function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}
function sign(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("base64url"); }
function safeEqual(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function canAdminLogin() { return Boolean(sessionSecret()); }
export async function authenticateAdmin(email: string, password: string) {
  const account = await authenticateUser(email, password);
  return Boolean(account && account.position === "system_admin");
}
export function createAdminSessionToken(email: string, sessionVersion = 0) {
  const secret = sessionSecret();
  if (!secret) throw new Error("User authentication is not configured.");
  const payload = Buffer.from(JSON.stringify({ email: email.trim().toLowerCase(), sessionVersion, expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}
export async function getUserSession(headers: Headers): Promise<UserSession | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const cookie = (headers.get("cookie") ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  const [payload, signature, ...extra] = cookie.slice(COOKIE_NAME.length + 1).split(".");
  if (!payload || !signature || extra.length || !safeEqual(signature, sign(payload, secret))) return null;
  try {
    const token = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: unknown; expiresAt?: unknown; sessionVersion?: unknown };
    if (typeof token.email !== "string" || typeof token.expiresAt !== "number" || token.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    const account = await findAccount(token.email);
    if (!account || !account.active || account.sessionVersion !== (token.sessionVersion ?? 0)) return null;
    return { ...publicUser(account), sessionVersion: account.sessionVersion, expiresAt: token.expiresAt };
  } catch { return null; }
}
// Existing task/product endpoints use this guard; temporary-password sessions cannot mutate data.
export async function getAdminSession(headers: Headers): Promise<AdminSession | null> {
  const session = await getUserSession(headers);
  return session && !session.mustChangePassword && isManager(session.position) ? session : null;
}
export async function getSystemAdminSession(headers: Headers) {
  const session = await getAdminSession(headers);
  return session?.position === "system_admin" ? session : null;
}
export function adminSessionCookie(token: string) { return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`; }
export function clearedAdminSessionCookie() { return `${COOKIE_NAME}=; Path=/; HttpOnly; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}SameSite=Strict; Max-Age=0`; }

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requestOrigin = new URL(origin).origin;
    if (requestOrigin === new URL(request.url).origin) return true;
    // Netlify may rewrite request.url to a branch alias. URL is the trusted
    // main site address supplied to functions by the hosting platform.
    const siteUrl = process.env.URL;
    return Boolean(siteUrl && requestOrigin === new URL(siteUrl).origin);
  } catch {
    return false;
  }
}

