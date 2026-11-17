import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { accountSchema } from "./user-accounts";
import { taskInputSchema, productInputSchema } from "./products";
import { projectInputSchema } from "./projects";

export const DATA_KEYS = ["tasks", "products", "projects", "entities", "user-accounts-v1", "admin-emails", "registration-requests-v1", "chat-messages-v1", "activity-log-v1", "gmail-oauth-v1"] as const;
export type DataKey = typeof DATA_KEYS[number];
export type Dataset = Record<DataKey, unknown>;
export type BackupPayload = { format: "mproject-data"; version: 1; createdAt: string; createdBy: string; data: Dataset; checksum: string };
export type BackupSummary = { key: DataKey; count: number; present: boolean }[];
const derive = promisify(scrypt);
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
export function checksum(data: unknown) { return createHash("sha256").update(JSON.stringify(data)).digest("hex"); }
const id = z.string().min(1).max(254);
const row = z.object({ id }).passthrough();
const schemas: Partial<Record<DataKey, z.ZodTypeAny>> = {
  tasks: z.array(row.and(taskInputSchema)),
  products: z.array(z.union([row.and(productInputSchema), row.extend({ deleted: z.literal(true) })])),
  projects: z.array(z.union([row.and(projectInputSchema), row.extend({ deleted: z.literal(true) })])),
  entities: z.array(row.extend({ name: z.string().min(1).max(120), description: z.string(), hidden: z.boolean().optional(), deleted: z.boolean().optional() })),
  "user-accounts-v1": z.array(accountSchema),
  "admin-emails": z.array(z.string().email()),
  "registration-requests-v1": z.array(row.extend({ name: z.string(), email: z.string().email(), status: z.enum(["pending", "approved", "rejected", "on_hold", "activated"]), notifications: z.array(z.object({ id, to: z.string().email(), subject: z.string(), text: z.string(), status: z.enum(["queued", "sent", "failed"]), sentAt: z.string().nullable() }).passthrough()) })),
  "chat-messages-v1": z.array(row.extend({ sender: z.string().email(), recipient: z.string().email(), text: z.string(), createdAt: z.string(), deletedFor: z.array(z.string().email()), editedAt: z.string().nullable(), readAt: z.string().nullable(), recalledAt: z.string().nullable(), removedAt: z.string().nullable() })),
  "activity-log-v1": z.array(row.extend({ actorEmail: z.string(), actorName: z.string(), action: z.string(), resource: z.string(), createdAt: z.string(), details: z.array(z.string()).optional() })),
  "gmail-oauth-v1": z.string().min(1),
};
export class BackupError extends Error {}
export function validateData(value: unknown): asserts value is Dataset {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BackupError("ملف البيانات غير صالح.");
  const data = value as Dataset;
  if (Object.keys(data).length !== DATA_KEYS.length || DATA_KEYS.some(key => !Object.hasOwn(data, key))) throw new BackupError("النسخة لا تتضمن جميع مجموعات البيانات المطلوبة.");
  for (const key of DATA_KEYS) {
    if (data[key] === null && key !== "user-accounts-v1") continue;
    if (!schemas[key]?.safeParse(data[key]).success) throw new BackupError(`بيانات غير صالحة في: ${key}`);
    if (Array.isArray(data[key])) {
      const ids = data[key].map((item: { id?: string; email?: string }) => typeof item === "string" ? item : item.id ?? item.email);
      if (ids.some(value => value === undefined) || new Set(ids).size !== ids.length) throw new BackupError(`معرّفات مكررة أو مفقودة في: ${key}`);
    }
  }
  const users = data["user-accounts-v1"] as { active: boolean; deleted?: boolean; position?: string; loginEmail?: string; email: string }[];
  if (!users.some(user => user.active && !user.deleted && user.position === "system_admin")) throw new BackupError("يجب أن تحتوي النسخة على مدير نظام نشط.");
  if (new Set(users.map(user => user.loginEmail ?? user.email)).size !== users.length) throw new BackupError("بريد الدخول مكرر في النسخة.");
}
export function summarize(data: Dataset): BackupSummary { return DATA_KEYS.map(key => ({ key, present: data[key] !== null, count: Array.isArray(data[key]) ? data[key].length : data[key] === null ? 0 : 1 })); }
export function makePayload(data: Dataset, email: string): BackupPayload {
  validateData(data);
  return { format: "mproject-data", version: 1, createdAt: new Date().toISOString(), createdBy: email, data, checksum: checksum(data) };
}
export async function encryptBackup(payload: BackupPayload, password: string) {
  if (password.length < 12 || password.length > 128) throw new BackupError("اختر كلمة مرور للنسخة من 12 إلى 128 حرفًا.");
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = await derive(password, salt, 32) as Buffer;
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const envelope = { format: "mproject-encrypted-backup", version: 1, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
  if (Buffer.byteLength(JSON.stringify(envelope)) > MAX_BACKUP_BYTES - 4096) throw new BackupError("حجم النسخة يتجاوز الحد المدعوم (4 ميجابايت).");
  return envelope;
}
const envelopeSchema = z.object({ format: z.literal("mproject-encrypted-backup"), version: z.literal(1), salt: z.string().length(24), iv: z.string().length(16), tag: z.string().length(24), ciphertext: z.string().min(1).max(MAX_BACKUP_BYTES) }).strict();
export async function decryptBackup(value: unknown, password: string): Promise<BackupPayload> {
  if (password.length < 12 || password.length > 128) throw new BackupError("كلمة مرور النسخة غير صالحة.");
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) throw new BackupError("صيغة النسخة أو إصدارها غير مدعوم.");
  let payload: BackupPayload;
  try {
    const e = parsed.data, salt = Buffer.from(e.salt, "base64"), iv = Buffer.from(e.iv, "base64"), tag = Buffer.from(e.tag, "base64");
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error();
    const key = await derive(password, salt, 32) as Buffer;
    const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(tag);
    payload = JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.ciphertext, "base64")), decipher.final()]).toString("utf8"));
  } catch { throw new BackupError("كلمة المرور غير صحيحة أو ملف النسخة تالف."); }
  if (payload?.format !== "mproject-data" || payload.version !== 1 || typeof payload.createdAt !== "string" || !Number.isFinite(Date.parse(payload.createdAt)) || typeof payload.createdBy !== "string") throw new BackupError("بيانات تعريف النسخة غير صالحة.");
  validateData(payload.data);
  if (checksum(payload.data) !== payload.checksum) throw new BackupError("فشل التحقق من سلامة النسخة.");
  return payload;
}
