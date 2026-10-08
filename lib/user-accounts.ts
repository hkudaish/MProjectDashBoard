import { getStore } from "@netlify/blobs";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { getAllAdminEmails, normalizeAdminEmail } from "./legacy-admins";
import type { PublicUser, UserRole } from "./user-types";

const deriveKey = promisify(scrypt);
const KEY = "user-accounts-v1";
export const passwordSchema = z.string().min(10, "كلمة المرور يجب أن تحتوي على 10 أحرف على الأقل.").max(128, "كلمة المرور طويلة جدًا.").refine((v) => v.trim().length >= 10, "كلمة المرور يجب ألا تتكون من مسافات.");
export const emailSchema = z.string().trim().email("أدخل بريدًا إلكترونيًا صالحًا.").max(254).transform(normalizeAdminEmail);
export const createUserSchema = z.object({ email: emailSchema, name: z.string().trim().min(1, "أدخل اسم المستخدم.").max(120), role: z.enum(["admin", "editor", "viewer"]), password: passwordSchema });
const accountSchema = z.object({
  email: emailSchema, name: z.string(), role: z.enum(["admin", "editor", "viewer"]), active: z.boolean(),
  passwordHash: z.string().regex(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/),
  mustChangePassword: z.boolean(), sessionVersion: z.number().int().min(0),
  resetRequestedAt: z.string().nullable(), failedAttempts: z.number().int().min(0), lockedUntil: z.number(),
});
type Account = z.infer<typeof accountSchema>;
let memory: { data: Account[]; etag: string } | null = null;
let memoryVersion = 0;
function accountStore() {
  return process.env.NODE_ENV === "production" && process.env.TASK_STORE_MODE !== "memory" ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null;
}
async function snapshot() {
  const store = accountStore();
  const raw = store ? await store.getWithMetadata(KEY, { type: "json" }) : memory;
  if (!raw) return null;
  if (!raw.etag) throw new Error("Missing account registry version");
  const parsed = z.array(accountSchema).parse(raw.data);
  if (new Set(parsed.map((a) => a.email)).size !== parsed.length) throw new Error("Invalid account registry");
  return { data: parsed, etag: raw.etag };
}
async function commit(data: Account[], etag?: string) {
  const store = accountStore();
  if (store) {
    const result = await store.setJSON(KEY, data, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    return result.modified;
  }
  if (etag ? memory?.etag !== etag : memory !== null) return false;
  memory = { data: structuredClone(data), etag: String(++memoryVersion) };
  return true;
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await deriveKey(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  if (password.length > 128) return false;
  const [, salt, hash] = encoded.split("$");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await deriveKey(password, salt, 64) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
async function registry() {
  const existing = await snapshot();
  if (existing) return existing;
  const emails = await getAllAdminEmails();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !emails.length) throw new Error("User accounts are not configured");
  const accounts = await Promise.all(emails.map(async (email): Promise<Account> => ({
    email, name: email, role: "admin", active: true, passwordHash: await hashPassword(password),
    mustChangePassword: true, sessionVersion: 0, resetRequestedAt: null, failedAttempts: 0, lockedUntil: 0,
  })));
  await commit(accounts);
  const initialized = await snapshot();
  if (!initialized) throw new Error("Unable to initialize accounts");
  return initialized;
}
async function updateRegistry<T>(update: (accounts: Account[]) => Promise<T> | T): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await registry();
    const data = structuredClone(current.data);
    const result = await update(data);
    if (await commit(data, current.etag)) return result;
  }
  throw new Error("حدث تعديل متزامن على الحسابات. حاول مرة أخرى.");
}
export function publicUser(account: Account): PublicUser {
  const { email, name, role, active, mustChangePassword, resetRequestedAt } = account;
  return { email, name, role, active, mustChangePassword, resetRequestedAt };
}
export async function listUsers() { return (await registry()).data.map(publicUser); }
export async function findAccount(email: string) { return (await registry()).data.find((a) => a.email === normalizeAdminEmail(email)) ?? null; }
export async function authenticateUser(email: string, password: string) {
  const account = await findAccount(email);
  if (!account || !account.active || account.lockedUntil > Date.now()) return null;
  if (!(await verifyPassword(password, account.passwordHash))) {
    await updateRegistry((accounts) => {
      const current = accounts.find((a) => a.email === account.email)!;
      if (current.sessionVersion !== account.sessionVersion) return;
      current.failedAttempts++;
      if (current.failedAttempts >= 5) { current.lockedUntil = Date.now() + 15 * 60 * 1000; current.failedAttempts = 0; }
    });
    return null;
  }
  // Re-read and check the credential version in case a reset or permission change occurred during verification.
  return updateRegistry((accounts) => {
    const current = accounts.find((a) => a.email === account.email)!;
    if (!current.active || current.sessionVersion !== account.sessionVersion || current.lockedUntil > Date.now()) return null;
    current.failedAttempts = 0; current.lockedUntil = 0;
    return current;
  });
}
export async function createUser(input: z.infer<typeof createUserSchema>) {
  const parsed = createUserSchema.parse(input);
  const passwordHash = await hashPassword(parsed.password);
  return updateRegistry((accounts) => {
    if (accounts.some((a) => a.email === parsed.email)) throw new Error("يوجد حساب بهذا البريد الإلكتروني بالفعل.");
    const account: Account = { email: parsed.email, name: parsed.name, role: parsed.role, active: true, passwordHash, mustChangePassword: true, sessionVersion: 1, resetRequestedAt: null, failedAttempts: 0, lockedUntil: 0 };
    accounts.push(account);
    return publicUser(account);
  });
}
export async function updateUser(email: string, actorEmail: string, changes: { role?: UserRole; active?: boolean; temporaryPassword?: string }) {
  const hash = changes.temporaryPassword ? await hashPassword(passwordSchema.parse(changes.temporaryPassword)) : null;
  return updateRegistry((accounts) => {
    const account = accounts.find((a) => a.email === normalizeAdminEmail(email));
    if (!account) throw new Error("الحساب غير موجود.");
    if (account.email === actorEmail && (changes.role && changes.role !== account.role || changes.active === false)) throw new Error("لا يمكنك تعطيل حسابك أو تغيير صلاحياتك بنفسك.");
    if (changes.role) account.role = changes.role;
    if (changes.active !== undefined) account.active = changes.active;
    if (!accounts.some((a) => a.active && a.role === "admin")) throw new Error("يجب الإبقاء على مسؤول نظام نشط واحد على الأقل.");
    if (hash) { account.passwordHash = hash; account.mustChangePassword = true; account.resetRequestedAt = null; account.failedAttempts = 0; account.lockedUntil = 0; }
    account.sessionVersion++;
    return publicUser(account);
  });
}
export async function changeUserPassword(email: string, version: number, currentPassword: string, newPassword: string) {
  passwordSchema.parse(newPassword);
  const account = await findAccount(email);
  if (!account || !account.active || account.sessionVersion !== version || !(await verifyPassword(currentPassword, account.passwordHash))) throw new Error("كلمة المرور الحالية غير صحيحة أو انتهت الجلسة.");
  if (await verifyPassword(newPassword, account.passwordHash)) throw new Error("اختر كلمة مرور مختلفة عن كلمة المرور الحالية.");
  const hash = await hashPassword(newPassword);
  return updateRegistry((accounts) => {
    const current = accounts.find((a) => a.email === account.email)!;
    if (!current.active || current.sessionVersion !== version) throw new Error("انتهت الجلسة. سجّل الدخول مجددًا.");
    current.passwordHash = hash; current.mustChangePassword = false; current.sessionVersion++;
    current.resetRequestedAt = null; current.failedAttempts = 0; current.lockedUntil = 0;
    return current;
  });
}
export async function requestPasswordReset(email: string) {
  const account = await findAccount(email);
  if (!account || !account.active || account.resetRequestedAt) return;
  await updateRegistry((accounts) => {
    const current = accounts.find((a) => a.email === account.email)!;
    if (!current.resetRequestedAt) current.resetRequestedAt = new Date().toISOString();
  });
}
