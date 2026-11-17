import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import ts from "typescript";

const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, "..");
const rows = new Map(); let revision = 0, failKey = "", actor;
const store = {
  async get(key) { return structuredClone(rows.get(key)?.data ?? null); },
  async getWithMetadata(key) { return structuredClone(rows.get(key) ?? null); },
  async setJSON(key, data, conditions = {}) {
    if (failKey && key.startsWith("data-") && key.endsWith(failKey)) throw new Error("Injected storage failure");
    const current = rows.get(key);
    if (conditions.onlyIfNew && current || conditions.onlyIfMatch && current?.etag !== conditions.onlyIfMatch) return { modified: false };
    rows.set(key, { data: structuredClone(data), etag: String(++revision) }); return { modified: true };
  },
};
const stubs = {
  "@netlify/blobs": { getStore: () => store },
  "./local-store": { getLocalStore: () => null },
  "@/lib/admin-auth": { getSystemAdminSession: async () => actor, hasSameOrigin: request => request.headers.get("origin") === "https://test.example", clearedAdminSessionCookie: () => "task_admin_session=; Max-Age=0" },
};
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const sourceModule = new vm.SourceTextModule(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  const ready = sourceModule.link(specifier => {
    const values = stubs[specifier] ?? (specifier.startsWith("node:") || specifier === "zod" ? require(specifier) : null);
    if (values) return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); });
    return load(specifier.startsWith("@/") ? path.resolve(root, specifier.slice(2) + ".ts") : path.resolve(path.dirname(file), specifier + ".ts"));
  }).then(() => sourceModule);
  cache.set(file, ready); return ready;
}
async function exports(file) { const sourceModule = await load(path.resolve(root, file)); await sourceModule.evaluate(); return sourceModule.namespace; }
const codec = await exports("lib/backup-format.ts"), service = await exports("lib/backups.ts"), dataStore = await exports("lib/data-store.ts"), route = await exports("app/api/backups/route.ts");
const backupPassword = "backup password 123!", loginPassword = "admin password 123!";
const salt = "a".repeat(32), hash = "scrypt$" + salt + "$" + crypto.scryptSync(loginPassword, salt, 64).toString("hex");
const account = { email: "admin@example.com", loginEmail: "admin@example.com", name: "Admin", role: "admin", position: "system_admin", active: true, passwordHash: hash, mustChangePassword: false, sessionVersion: 2, resetRequestedAt: null, failedAttempts: 0, lockedUntil: 0 };
const fixture = () => ({ ...Object.fromEntries(codec.DATA_KEYS.map(key => [key, null])), tasks: [{ id: "task1", productId: "p1", productName: "Product", title: "Task", plannedDate: "2026-11-01", endDate: "2026-11-02", status: "not_started", progress: 0, ownerType: "unassigned", assignee: "", notes: "", sourceOrder: 1, updatedAt: "2026-11-01", futureField: "preserved" }], products: [{ id: "p1", projectId: "project1", name: "Product", target: "", description: "", details: [] }], projects: [{ id: "project1", name: "Project", description: "" }], entities: [], "user-accounts-v1": [structuredClone(account)], "activity-log-v1": [], "chat-messages-v1": [], "registration-requests-v1": [], "gmail-oauth-v1": "encrypted-oauth-value" });
beforeEach(async () => {
  process.env.NODE_ENV = "production"; delete process.env.TASK_STORE_MODE;
  process.env.ADMIN_SESSION_SECRET = "backup-test-session-secret-with-32-characters";
  rows.clear(); revision = 0; failKey = ""; actor = { email: account.email, name: account.name };
  for (const [key, value] of Object.entries(fixture())) await store.setJSON(key, value);
});
const request = (body, origin = "https://test.example") => new Request("https://test.example/api/backups", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function saved() { const entry = await service.createBackup(actor, backupPassword); return { entry, ...(await service.downloadBackup(entry.id)) }; }
async function restoreInput(file) { return { file, password: backupPassword, ...(await service.previewRestore(actor, file, backupPassword)), confirmation: "استعادة", loginEmail: account.email, loginPassword }; }

test("full backup encrypts every dataset and preserves unknown fields and absent keys", async () => {
  const { file } = await saved();
  assert.equal(JSON.stringify(file).includes(account.email), false);
  assert.deepEqual((await codec.decryptBackup(file, backupPassword)).data, fixture());
  assert.equal((await service.listBackups()).length, 1);
  await assert.rejects(codec.decryptBackup(file, "incorrect password"));
  const tampered = { ...file, ciphertext: (file.ciphertext[0] === "A" ? "B" : "A") + file.ciphertext.slice(1) };
  await assert.rejects(codec.decryptBackup(tampered, backupPassword));
  await assert.rejects(codec.decryptBackup({ ...file, version: 2 }, backupPassword));
});
test("malformed data, missing datasets, duplicate identities and missing administrator are rejected", () => {
  const missing = fixture(); delete missing.entities; assert.throws(() => codec.makePayload(missing, account.email));
  const invalid = fixture(); invalid.tasks[0].plannedDate = "bad"; assert.throws(() => codec.makePayload(invalid, account.email));
  const duplicate = fixture(); duplicate["user-accounts-v1"].push(structuredClone(account)); assert.throws(() => codec.makePayload(duplicate, account.email));
  const noAdmin = fixture(); noAdmin["user-accounts-v1"][0].active = false; assert.throws(() => codec.makePayload(noAdmin, account.email));
});
test("restore takes a recovery snapshot, replaces all datasets, invalidates sessions and preserves history", async () => {
  const { file, entry } = await saved();
  await dataStore.getDataStore().setJSON("tasks", []);
  const input = await restoreInput(file);
  const result = await service.restoreBackup(actor, input);
  assert.equal((await dataStore.getDataStore().get("tasks"))[0].futureField, "preserved");
  assert.equal((await dataStore.getDataStore().get("user-accounts-v1"))[0].sessionVersion, 3);
  assert.equal((await dataStore.getDataStore().get("activity-log-v1")).at(-1).action, "استعادة نسخة احتياطية");
  const recovery = await service.downloadBackup(result.recoveryId);
  assert.deepEqual((await codec.decryptBackup(recovery.file, backupPassword)).data.tasks, []);
  assert.ok((await service.listBackups()).some(value => value.id === entry.id));
  assert.equal(await dataStore.getDataStore().get("admin-emails"), null);
});
test("a failed staging write leaves the complete current dataset active", async () => {
  const { file } = await saved(); await dataStore.getDataStore().setJSON("tasks", []);
  const input = await restoreInput(file); failKey = "projects";
  await assert.rejects(service.restoreBackup(actor, input), /Injected storage failure/);
  assert.deepEqual(await dataStore.getDataStore().get("tasks"), []);
  assert.equal((await store.get("backup-state-v1")).namespace, "");
  assert.equal((await service.listBackups())[0].reason, "before-restore");
});
test("changed data, mismatched file, expired preview and invalid credentials cannot restore", async () => {
  const { file } = await saved(), input = await restoreInput(file);
  await dataStore.getDataStore().setJSON("tasks", []);
  await assert.rejects(service.restoreBackup(actor, input), /تغيّرت البيانات/);
  const fresh = await restoreInput(file);
  await assert.rejects(service.restoreBackup(actor, { ...fresh, loginPassword: "wrong" }));
  await assert.rejects(service.restoreBackup(actor, { ...fresh, confirmation: "yes" }));
  await assert.rejects(service.restoreBackup(actor, { ...fresh, file: { ...file, tag: "x".repeat(24) } }));
  const [body] = fresh.token.split("."); const preview = JSON.parse(Buffer.from(body, "base64url")); preview.expires = 1;
  const expired = Buffer.from(JSON.stringify(preview)).toString("base64url");
  const signed = crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(expired).digest("base64url");
  await assert.rejects(service.restoreBackup(actor, { ...fresh, token: `${expired}.${signed}` }), /انتهت/);
  assert.deepEqual(await dataStore.getDataStore().get("tasks"), []);
});
test("writes started before a restore cannot overwrite the restored generation", async () => {
  const { file } = await saved(), stale = dataStore.getDataStore();
  const old = await stale.getWithMetadata("tasks");
  await service.restoreBackup(actor, await restoreInput(file));
  assert.equal((await stale.setJSON("tasks", [], { onlyIfMatch: old.etag })).modified, false);
  await assert.rejects(stale.setJSON("tasks", []));
  assert.equal((await dataStore.getDataStore().get("tasks")).length, 1);
});
test("backup API rejects anonymous, foreign-origin, malformed and oversized requests", async () => {
  actor = null; assert.equal((await route.GET(new Request("https://test.example/api/backups"))).status, 403);
  assert.equal((await route.POST(request({ action: "create", password: backupPassword }))).status, 403);
  actor = { email: account.email, name: account.name };
  assert.equal((await route.POST(request({ action: "create", password: backupPassword }, "https://foreign.example"))).status, 403);
  assert.equal((await route.POST(request({ action: "create", password: "short" }))).status, 400);
  assert.equal((await route.POST(request({ action: "create", password: "x".repeat(codec.MAX_BACKUP_BYTES) }))).status, 413);
  const created = await route.POST(request({ action: "create", password: backupPassword })); assert.equal(created.status, 201);
  const id = (await created.json()).backup.id;
  const downloaded = await route.GET(new Request("https://test.example/api/backups?id=" + id));
  assert.equal(downloaded.headers.get("cache-control"), "no-store");
  assert.match(downloaded.headers.get("content-disposition"), /attachment/);
  const input = await restoreInput(await downloaded.json());
  const restored = await route.POST(request({ action: "restore", file: input.file, password: input.password, token: input.token, confirmation: input.confirmation, loginEmail: input.loginEmail, loginPassword: input.loginPassword }));
  assert.equal(restored.status, 200); assert.match(restored.headers.get("set-cookie"), /Max-Age=0/);
});
