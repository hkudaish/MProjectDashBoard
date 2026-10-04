import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "task_admin_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export type AdminSession = { email: string; expiresAt: number };

function adminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function canAdminLogin() {
  return Boolean(
    process.env.ADMIN_PASSWORD &&
      adminEmails().size > 0 &&
      sessionSecret(),
  );
}

export function authenticateAdmin(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const configuredPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!canAdminLogin() || !adminEmails().has(normalizedEmail)) return false;
  return safeEqual(password, configuredPassword);
}

export function createAdminSessionToken(email: string) {
  const secret = sessionSecret();
  if (!secret) throw new Error("Admin authentication is not configured.");
  const session: AdminSession = {
    email: email.trim().toLowerCase(),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function getAdminSession(headers: Headers): AdminSession | null {
  const secret = sessionSecret();
  if (!secret || !canAdminLogin()) return null;

  const cookieHeader = headers.get("cookie") ?? "";
  const rawCookie = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
  if (!rawCookie) return null;

  const token = rawCookie.slice(COOKIE_NAME.length + 1);
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length) return null;

  try {
    if (!safeEqual(signature, sign(payload, secret))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
    if (
      typeof session.email !== "string" ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Math.floor(Date.now() / 1000) ||
      !adminEmails().has(session.email)
    ) return null;
    return session;
  } catch {
    return null;
  }
}

export function adminSessionCookie(token: string) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedAdminSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

