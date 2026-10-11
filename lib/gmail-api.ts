import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { getLocalStore } from "./local-store";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];
const KEY = "gmail-oauth-v1";
export function gmailAddress() { return process.env.GMAIL_USER?.trim().toLowerCase() || "hkudaish@gmail.com"; }
export function oauthReady() { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length >= 32); }
function storage() {
  return getLocalStore() ?? (process.env.NODE_ENV === "production" && process.env.TASK_STORE_MODE !== "memory" ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null);
}
let memory: string | null = null;
function encryptionKey() {
  const secret = process.env.GMAIL_TOKEN_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("OAuth encryption is not configured");
  return createHash("sha256").update(secret).digest();
}
export function seal(value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
export function unseal(value: string) {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
}
async function refreshToken(): Promise<string | null> {
  if (process.env.GOOGLE_REFRESH_TOKEN) return process.env.GOOGLE_REFRESH_TOKEN;
  const store = storage();
  const encrypted = store ? await store.get(KEY, { type: "json" }) : memory;
  if (!encrypted || typeof encrypted !== "string") return null;
  try {
    const record = unseal(encrypted) as { email: string; clientId: string; refreshToken: string };
    return record.email === gmailAddress() && record.clientId === process.env.GOOGLE_CLIENT_ID ? record.refreshToken : null;
  } catch { return null; }
}
export async function gmailConfigured() { return oauthReady() && Boolean(await refreshToken()); }
export async function saveRefreshToken(token: string) {
  const encrypted = seal({ email: gmailAddress(), clientId: process.env.GOOGLE_CLIENT_ID, refreshToken: token });
  const store = storage();
  if (store) await store.setJSON(KEY, encrypted); else memory = encrypted;
}
export async function tokenRequest(parameters: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...parameters }),
    signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Google authorization failed; reconnect Gmail");
  const data = await response.json() as { access_token: string; refresh_token?: string; scope?: string };
  if (!data.access_token) throw new Error("Google did not return an access token");
  return data;
}
export async function gmailRequest<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const token = accessToken ?? await gmailAccessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Gmail API request failed");
  return response.json() as Promise<T>;
}
export async function verifyGmailAccount(accessToken: string) {
  const profile = await gmailRequest<{ emailAddress: string }>("profile", {}, accessToken);
  if (profile.emailAddress.toLowerCase() !== gmailAddress()) throw new Error("Connect the configured Gmail account");
}
export async function gmailAccessToken() {
  if (!oauthReady()) throw new Error("Google OAuth credentials are missing");
  const token = await refreshToken();
  if (!token) throw new Error("Connect Gmail from Settings");
  const result = await tokenRequest({ grant_type: "refresh_token", refresh_token: token });
  await verifyGmailAccount(result.access_token);
  return result.access_token;
}
export function sameState(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
