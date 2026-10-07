import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "task_admin_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const STORE_NAME = "wamy-task-dashboard";
const ADMIN_EMAILS_KEY = "admin-emails";

export type AdminSession = { email: string; expiresAt: number };

export function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase();
}

function configuredAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(normalizeAdminEmail)
    .filter(Boolean);
}

async function storedAdminEmails() {
  try {
    const store = getStore(STORE_NAME, { consistency: "strong" });
    const value = await store.get(ADMIN_EMAILS_KEY, { type: "json" }) as unknown;
    if (!Array.isArray(value)) return [];
    return value.map((email) => normalizeAdminEmail(String(email))).filter((email) => email.includes("@"));
  } catch {
    return [];
  }
}

export async function getAllAdminEmails() {
  return [...new Set([...configuredAdminEmails(), ...await storedAdminEmails()])];
}

export async function addAdminEmail(email: string) {
  const normalizedEmail = normalizeAdminEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("أدخل بريدًا إلكترونيًا صالحًا.");
  }
  const admins = await getAllAdminEmails();
  const nextAdmins = [...new Set([...admins, normalizedEmail])];
  const store = getStore(STORE_NAME, { consistency: "strong" });
  await store.setJSON(ADMIN_EMAILS_KEY, nextAdmins);
  return nextAdmins;
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
      configuredAdminEmails().length > 0 &&
      sessionSecret(),
  );
}

export async function authenticateAdmin(email: string, password: string) {
  const normalizedEmail = normalizeAdminEmail(email);
  const configuredPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!canAdminLogin() || !(await getAllAdminEmails()).includes(normalizedEmail)) return false;
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

export async function getAdminSession(headers: Headers): Promise<AdminSession | null> {
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
      !(await getAllAdminEmails()).includes(normalizeAdminEmail(session.email))
    ) return null;
    return { ...session, email: normalizeAdminEmail(session.email) };
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

