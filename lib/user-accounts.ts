import { getStore } from "@netlify/blobs";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { getAllAdminEmails, normalizeAdminEmail } from "./legacy-admins";
import { createEntityStore } from "./entity-store";
import { MANAGER_POSITIONS, POSITIONS, type Position } from "./user-types";
import type { PublicUser } from "./user-types";

const deriveKey = promisify(scrypt);
const KEY = "user-accounts-v1";
export const passwordSchema = z.string().min(10, "كلمة المرور يجب أن تحتوي على 10 أحرف على الأقل.").max(128, "كلمة المرور طويلة جدًا.").refine((v) => v.trim().length >= 10, "كلمة المرور يجب ألا تتكون من مسافات.");
export const emailSchema = z.string().trim().email("أدخل بريدًا إلكترونيًا صالحًا.").max(254).transform(normalizeAdminEmail);
export const positionSchema = z.enum(Object.keys(POSITIONS) as [Position, ...Position[]]);
const managerLink = emailSchema.or(z.literal("")).nullable().transform((value) => value || null);
const reportingSelection = positionSchema;
const entityLink = z.string().trim().max(120).nullable().transform((value) => value || null);
export const createUserSchema = z.object({ email: emailSchema, name: z.string().trim().min(1, "أدخل اسم المستخدم.").max(120), position: positionSchema, managerEmail: managerLink.default(null), additionalManagerEmail: managerLink.default(null), managerPosition: reportingSelection.optional(), entityId: entityLink.default(null), password: passwordSchema });
export const updateUserSchema = z.object({ email: emailSchema, newEmail: emailSchema.optional(), name: z.string().trim().min(1).max(120).optional(), position: positionSchema.optional(), managerEmail: managerLink.optional(), additionalManagerEmail: managerLink.optional(), managerPosition: reportingSelection.optional(), entityId: entityLink.optional(), active: z.boolean().optional(), temporaryPassword: passwordSchema.optional() }).strict().refine((value) => Object.keys(value).some((key) => key !== "email"), "اختر التعديل المطلوب.");
export const HIERARCHY_ERRORS = ["حدد المنصب والمسؤول المباشر.", "مدير النظام مستقل ولا يرتبط بمسؤول مباشر أو جهة.", "المسؤول المباشر غير متوافق مع الهيكل الإداري.", "لا يمكن ربط المستخدم بنفسه أو تكوين ارتباط إداري دائري.", "الجهة المحددة غير متاحة للاختيار.", "تعديل المنصب أو تعطيل المسؤول يتعارض مع ارتباطات مستخدمين تابعين له. عدّل ارتباطاتهم أولًا."];
export const ACCOUNT_ERRORS = ["يوجد حساب بهذا البريد الإلكتروني بالفعل.", "لا يمكنك حذف حسابك الحالي.", "الحساب مرتبط بمستخدمين تابعين. عدّل ارتباطاتهم قبل الحذف."];
const accountSchema = z.object({
  loginEmail: emailSchema.optional(), deleted: z.boolean().optional(),
  position: positionSchema.nullable().optional(), managerEmail: managerLink.optional(), additionalManagerEmail: managerLink.optional(), entityId: entityLink.optional(),
  email: emailSchema, name: z.string(), role: z.enum(["admin", "editor", "viewer"]), active: z.boolean(),
  passwordHash: z.string().regex(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/).or(z.literal("")),
  mustChangePassword: z.boolean(), sessionVersion: z.number().int().min(0),
  resetRequestedAt: z.string().nullable(), failedAttempts: z.number().int().min(0), lockedUntil: z.number(),
}).refine((account) => account.deleted || account.passwordHash.length > 0, "Invalid credential").transform((account) => ({ ...account, loginEmail: account.loginEmail ?? account.email, position: account.position === undefined ? (account.role === "admin" ? "system_admin" as const : null) : account.position, managerEmail: account.managerEmail ?? null, additionalManagerEmail: account.additionalManagerEmail ?? null, entityId: account.entityId ?? null }));
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
  if (new Set(parsed.map((a) => a.email)).size !== parsed.length || new Set(parsed.map((a) => a.loginEmail)).size !== parsed.length) throw new Error("Invalid account registry");
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
    email, loginEmail: email, name: "مدير النظام", role: "admin", position: "system_admin", managerEmail: null, additionalManagerEmail: null, entityId: null, active: true, passwordHash: await hashPassword(password),
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
  const { email, loginEmail, name, role, position, managerEmail, additionalManagerEmail, entityId, active, mustChangePassword, resetRequestedAt } = account;
  return { email, loginEmail, name, role, position, managerEmail, additionalManagerEmail, entityId, active, mustChangePassword, resetRequestedAt };
}
export async function listUsers() { return (await registry()).data.filter((user) => !user.deleted).map(publicUser); }
export async function findAccount(email: string) { return (await registry()).data.find((a) => a.email === normalizeAdminEmail(email) && !a.deleted) ?? null; }
export async function authenticateUser(email: string, password: string) {
  const account = (await registry()).data.find((user) => !user.deleted && user.loginEmail === normalizeAdminEmail(email));
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
function roleForPosition(position: Position) { return position === "system_admin" ? "admin" as const : position === "employee" ? "viewer" as const : "editor" as const; }
async function validateHierarchy(accounts: Account[], changedEmail: string, previous?: Account, selection?: z.infer<typeof reportingSelection>) {
  const entities = await createEntityStore().getEntities();
  for (const account of accounts) {
    if (account.deleted) continue;
    if (!account.position) { if (account.email === changedEmail && account.active) throw new Error(HIERARCHY_ERRORS[0]); continue; }
    if (account.position === "system_admin") { if (account.managerEmail || account.additionalManagerEmail || account.entityId) throw new Error(HIERARCHY_ERRORS[1]); continue; }
    const isChanged = account.email === changedEmail;
    const requiredManagers = MANAGER_POSITIONS[account.position];
    const manager = accounts.find((candidate) => candidate.email === account.managerEmail && !candidate.deleted);
    const validManager = requiredManagers.length === 0
      ? !account.managerEmail
      : !account.managerEmail || Boolean(manager?.position && requiredManagers.includes(manager.position) && (!account.active || manager.active));
    const valid = validManager && !account.additionalManagerEmail;
    if (!valid) {
      // Preserve old reporting data for repair, without granting assignment rights.
      // A change must not invalidate a previously valid subordinate relationship.
      const previouslyValid = previous?.email === account.managerEmail && previous.position && requiredManagers.includes(previous.position) && (!account.active || previous.active) && !account.additionalManagerEmail;
      if (isChanged || previouslyValid) throw new Error(isChanged ? HIERARCHY_ERRORS[2] : HIERARCHY_ERRORS[5]);
      continue;
    }
    if (isChanged && account.managerEmail && selection && manager?.position !== selection) throw new Error(HIERARCHY_ERRORS[2]);
    if (account.entityId && !entities.some((entity) => entity.id === account.entityId && !entity.deleted && (!entity.hidden || !isChanged || previous?.entityId === account.entityId))) throw new Error(HIERARCHY_ERRORS[4]);
    const visited = new Set([account.email]); let supervisor: Account | undefined = manager;
    while (supervisor) { if (visited.has(supervisor.email)) throw new Error(HIERARCHY_ERRORS[3]); visited.add(supervisor.email); supervisor = accounts.find((candidate) => candidate.email === supervisor?.managerEmail); }
  }
}
export async function createUser(input: z.infer<typeof createUserSchema>) {
  const parsed = createUserSchema.parse(input);
  const passwordHash = await hashPassword(parsed.password);
  return updateRegistry(async (accounts) => {
    if (accounts.some((a) => a.email === parsed.email || a.loginEmail === parsed.email)) throw new Error("يوجد حساب بهذا البريد الإلكتروني بالفعل.");
    const account: Account = { email: parsed.email, loginEmail: parsed.email, name: parsed.name, role: roleForPosition(parsed.position), position: parsed.position, managerEmail: parsed.managerEmail, additionalManagerEmail: parsed.additionalManagerEmail, entityId: parsed.entityId, active: true, passwordHash, mustChangePassword: true, sessionVersion: 1, resetRequestedAt: null, failedAttempts: 0, lockedUntil: 0 };
    accounts.push(account);
    await validateHierarchy(accounts, account.email, undefined, parsed.managerPosition);
    return publicUser(account);
  });
}
export async function updateUser(email: string, actorEmail: string, changes: { newEmail?: string; name?: string; position?: Position; managerEmail?: string | null; additionalManagerEmail?: string | null; managerPosition?: z.infer<typeof reportingSelection>; entityId?: string | null; active?: boolean; temporaryPassword?: string }) {
  const hash = changes.temporaryPassword ? await hashPassword(passwordSchema.parse(changes.temporaryPassword)) : null;
  return updateRegistry(async (accounts) => {
    const account = accounts.find((a) => a.email === normalizeAdminEmail(email) && !a.deleted);
    if (!account) throw new Error("الحساب غير موجود.");
    const previous = structuredClone(account);
    if (account.email === actorEmail && (changes.position && changes.position !== account.position || changes.active === false)) throw new Error("لا يمكنك تعطيل حسابك أو تغيير صلاحياتك بنفسك.");
    if (changes.newEmail && changes.newEmail !== account.loginEmail) {
      if (accounts.some((user) => user.email !== account.email && (user.email === changes.newEmail || user.loginEmail === changes.newEmail))) throw new Error(ACCOUNT_ERRORS[0]);
      account.loginEmail = changes.newEmail;
    }
    if (changes.position) { account.position = changes.position; account.role = roleForPosition(changes.position); }
    if (changes.managerEmail !== undefined) account.managerEmail = changes.managerEmail;
    if (changes.additionalManagerEmail !== undefined) account.additionalManagerEmail = changes.additionalManagerEmail;
    if (changes.entityId !== undefined) account.entityId = changes.entityId;
    if (changes.name !== undefined) account.name = changes.name;
    if (changes.active !== undefined) account.active = changes.active;
    if (!accounts.some((a) => !a.deleted && a.active && a.position === "system_admin")) throw new Error("يجب الإبقاء على مسؤول نظام نشط واحد على الأقل.");
    if (changes.position !== undefined || changes.managerEmail !== undefined || changes.additionalManagerEmail !== undefined || changes.managerPosition !== undefined || changes.entityId !== undefined || changes.active !== undefined) await validateHierarchy(accounts, account.email, previous, changes.managerPosition);
    if (hash) { account.passwordHash = hash; account.mustChangePassword = true; account.resetRequestedAt = null; account.failedAttempts = 0; account.lockedUntil = 0; }
    if (hash || account.loginEmail !== previous.loginEmail || account.position !== previous.position || account.managerEmail !== previous.managerEmail || account.additionalManagerEmail !== previous.additionalManagerEmail || account.entityId !== previous.entityId || account.active !== previous.active) account.sessionVersion++;
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
  const account = (await registry()).data.find((user) => !user.deleted && user.loginEmail === normalizeAdminEmail(email));
  if (!account || !account.active || account.resetRequestedAt) return;
  await updateRegistry((accounts) => {
    const current = accounts.find((a) => a.email === account.email)!;
    if (!current.resetRequestedAt) current.resetRequestedAt = new Date().toISOString();
  });
}

// Keep the internal account identifier and historical assignments reserved after deletion.
export async function deleteUser(email: string, actorEmail: string) {
  return updateRegistry((accounts) => {
    const account = accounts.find((user) => user.email === normalizeAdminEmail(email) && !user.deleted);
    if (!account) throw new Error("الحساب غير موجود.");
    if (account.email === actorEmail) throw new Error(ACCOUNT_ERRORS[1]);
    if (accounts.some((user) => !user.deleted && (user.managerEmail === account.email || user.additionalManagerEmail === account.email))) throw new Error(ACCOUNT_ERRORS[2]);
    if (account.position === "system_admin" && !accounts.some((user) => !user.deleted && user.active && user.position === "system_admin" && user.email !== account.email)) throw new Error("يجب الإبقاء على مسؤول نظام نشط واحد على الأقل.");
    account.active = false; account.deleted = true; account.passwordHash = ""; account.resetRequestedAt = null; account.sessionVersion++;
    return { deleted: true };
  });
}
