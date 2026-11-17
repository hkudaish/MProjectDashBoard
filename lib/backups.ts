import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { getRawDataStore, dataKey, withDataLock, type DataStore } from "./data-store";
import { DATA_KEYS, BackupError, checksum, makePayload, encryptBackup, decryptBackup, summarize, type Dataset, type BackupPayload } from "./backup-format";
import { verifyPassword } from "./user-accounts";
type Actor = { email: string; name: string };
export type BackupEntry = { id: string; createdAt: string; createdBy: string; reason: "manual" | "before-restore"; summary: ReturnType<typeof summarize>; checksum: string };
const INDEX = "backup-index-v1";
function storage() { const store = getRawDataStore(); if (!store) throw new BackupError("يجب تفعيل التخزين الدائم قبل استخدام النسخ الاحتياطي."); return store; }
async function readData(store: DataStore, namespace: string): Promise<Dataset> {
  const entries = await Promise.all(DATA_KEYS.map(async key => [key, await store.get(dataKey(namespace, key), { type: "json" }) ?? null]));
  return Object.fromEntries(entries) as Dataset;
}
async function archive(store: DataStore, payload: BackupPayload, password: string, reason: BackupEntry["reason"]) {
  const id = randomUUID(), file = await encryptBackup(payload, password);
  const entry: BackupEntry = { id, createdAt: payload.createdAt, createdBy: payload.createdBy, reason, summary: summarize(payload.data), checksum: payload.checksum };
  await store.setJSON(`backup-archive-${id}`, file, { onlyIfNew: true });
  const entries = (await store.get(INDEX, { type: "json" }) ?? []) as BackupEntry[];
  await store.setJSON(INDEX, [entry, ...entries]);
  return entry;
}
export async function listBackups() { return (await storage().get(INDEX, { type: "json" }) ?? []) as BackupEntry[]; }
export async function downloadBackup(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new BackupError("معرّف النسخة غير صالح.");
  const entry = (await listBackups()).find(item => item.id === id);
  if (!entry) throw new BackupError("النسخة غير موجودة.");
  const file = await storage().get(`backup-archive-${id}`, { type: "json" });
  if (!file) throw new BackupError("ملف النسخة غير موجود.");
  return { entry, file };
}
export async function createBackup(actor: Actor, password: string) {
  const store = storage();
  return withDataLock(store, async state => archive(store, makePayload(await readData(store, state.namespace), actor.email), password, "manual"));
}
function signPreview(body: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new BackupError("لم يتم إعداد التوقيع الآمن.");
  return createHmac("sha256", secret).update(body).digest("base64url");
}
export async function previewRestore(actor: Actor, file: unknown, password: string) {
  const payload = await decryptBackup(file, password), store = storage();
  return withDataLock(store, async state => {
    const current = await readData(store, state.namespace);
    const body = Buffer.from(JSON.stringify({ actor: actor.email, file: checksum(file), current: checksum(current), namespace: state.namespace, expires: Date.now() + 10 * 60_000 })).toString("base64url");
    return { createdAt: payload.createdAt, createdBy: payload.createdBy, summary: summarize(payload.data), currentSummary: summarize(current), token: `${body}.${signPreview(body)}` };
  });
}
export async function restoreBackup(actor: Actor, input: { file: unknown; password: string; token: string; confirmation: string; loginEmail: string; loginPassword: string }) {
  if (input.confirmation !== "استعادة") throw new BackupError("اكتب استعادة لتأكيد استبدال جميع البيانات.");
  const [body, signature, extra] = input.token.split(".");
  const expected = signPreview(body || ""), actual = Buffer.from(signature || ""), signed = Buffer.from(expected);
  if (extra || actual.length !== signed.length || !timingSafeEqual(actual, signed)) throw new BackupError("أعد معاينة النسخة قبل الاستعادة.");
  let preview: { actor: string; file: string; current: string; namespace: string; expires: number };
  try { preview = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new BackupError("معاينة غير صالحة."); }
  if (preview.actor !== actor.email || preview.file !== checksum(input.file) || !Number.isFinite(preview.expires) || preview.expires < Date.now()) throw new BackupError("انتهت صلاحية المعاينة. أعد المعاينة.");
  const payload = await decryptBackup(input.file, input.password);
  type Account = { email: string; loginEmail?: string; active: boolean; deleted?: boolean; position?: string; passwordHash: string; sessionVersion: number; lockedUntil: number; failedAttempts: number };
  const users = payload.data["user-accounts-v1"] as Account[];
  const administrator = users.find(user => user.active && !user.deleted && user.position === "system_admin" && (user.loginEmail ?? user.email) === input.loginEmail.trim().toLowerCase());
  if (!administrator || administrator.lockedUntil > Date.now() || !(await verifyPassword(input.loginPassword, administrator.passwordHash))) throw new BackupError("تحقق من بريد وكلمة مرور مدير النظام الموجود في النسخة لضمان الدخول بعد الاستعادة.");
  const store = storage();
  return withDataLock(store, async (state, commit) => {
    const current = await readData(store, state.namespace);
    if (state.namespace !== preview.namespace || checksum(current) !== preview.current) throw new BackupError("تغيّرت البيانات بعد المعاينة. أعد المعاينة لتجنب فقد التعديلات الجديدة.");
    const recovery = await archive(store, makePayload(current, actor.email), input.password, "before-restore");
    const oldUsers = current["user-accounts-v1"] as Account[];
    for (const user of users) {
      const previous = oldUsers.find(old => old.email === user.email);
      user.sessionVersion = Math.max(user.sessionVersion, previous?.sessionVersion ?? 0) + 1;
    }
    const events = (payload.data["activity-log-v1"] ?? []) as unknown[];
    events.push({ id: randomUUID(), actorEmail: actor.email, actorName: actor.name, action: "استعادة نسخة احتياطية", resource: "النظام", createdAt: new Date().toISOString(), details: [`تاريخ النسخة: ${payload.createdAt}`, `نسخة التعافي: ${recovery.id}`] });
    payload.data["activity-log-v1"] = events;
    const namespace = `data-${randomUUID()}`;
    for (const key of DATA_KEYS) {
      const result = await store.setJSON(dataKey(namespace, key), payload.data[key], { onlyIfNew: true });
      if (!result.modified) throw new Error("تعذر تجهيز الاستعادة.");
    }
    if (checksum(await readData(store, namespace)) !== checksum(payload.data)) throw new Error("فشل التحقق من البيانات المستعادة.");
    commit(namespace);
    return { recoveryId: recovery.id, summary: summarize(payload.data) };
  });
}
