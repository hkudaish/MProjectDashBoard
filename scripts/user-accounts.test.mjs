import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { beforeEach, test } from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const data = new Map();
let revision = 0;
let writes = 0;
const store = {
  async get(key) { return structuredClone(data.get(key)?.value ?? null); },
  async getWithMetadata(key) { const row = data.get(key); return row ? { data: structuredClone(row.value), etag: row.etag } : null; },
  async setJSON(key, value, options = {}) {
    const existing = data.get(key);
    if (options.onlyIfNew && existing || options.onlyIfMatch && existing?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++revision); data.set(key, { value: structuredClone(value), etag }); writes++;
    return { modified: true, etag };
  },
};
const seed = { id: "task-1", productId: "digital", productName: "المحتوى الرقمي", title: "مهمة", plannedDate: "2026-10-08", endDate: "2026-10-09", status: "not_started", progress: 0, ownerType: "unassigned", assignee: "", notes: "", sourceOrder: 1, updatedAt: "2026-10-08" };
const stubs = { "@netlify/blobs": { getStore: () => store }, "zod": { z: require("zod").z }, "node:crypto": require("node:crypto"), "node:util": require("node:util"), "@/lib/task-data": { DEFAULT_TASKS: [seed] } };
const cache = new Map();
async function load(path) {
  if (cache.has(path)) return cache.get(path);
  const sourceModule = new vm.SourceTextModule(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  const linked = sourceModule.link((specifier) => {
    if (stubs[specifier]) { const values = stubs[specifier]; return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }); }
    return load(specifier.startsWith("@/") ? resolve(root, specifier.slice(2) + ".ts") : resolve(dirname(path), specifier + ".ts"));
  });
  const ready = linked.then(() => sourceModule);
  cache.set(path, ready);
  return ready;
}
async function exports(path) { const sourceModule = await load(resolve(root, path)); await sourceModule.evaluate(); return sourceModule.namespace; }
const accounts = await exports("lib/user-accounts.ts");
const auth = await exports("lib/admin-auth.ts");
const login = await exports("app/api/auth/login/route.ts");
const users = await exports("app/api/auth/users/route.ts");
const legacy = await exports("app/api/auth/admins/route.ts");
const password = await exports("app/api/auth/password/route.ts");
const reset = await exports("app/api/auth/password-reset/route.ts");
const session = await exports("app/api/auth/session/route.ts");
const tasks = await exports("app/api/tasks/route.ts");
const products = await exports("app/api/products/route.ts");
const projects = await exports("app/api/projects/route.ts");
const oldPassword = "LegacyPassword123";
const personalPassword = "PersonalPassword456";
const temporaryPassword = "TemporaryPassword789";
const origin = "https://example.com";
function request(body, cookie = "", method = "POST", suppliedOrigin = origin) {
  return new Request(`${origin}/api`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(suppliedOrigin ? { origin: suppliedOrigin } : {}) }, ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
}
function cookie(response) { return response.headers.get("set-cookie").split(";")[0]; }
async function signIn(email, value) { return login.POST(request({ email, password: value })); }
async function adminCookie() {
  const first = await signIn("admin@example.com", oldPassword); assert.equal(first.status, 200);
  const changed = await password.POST(request({ currentPassword: oldPassword, newPassword: personalPassword }, cookie(first)));
  assert.equal(changed.status, 200); return cookie(changed);
}
async function newUser(admin, email, role = "editor") {
  const response = await users.POST(request({ email, name: "مستخدم", role, password: temporaryPassword }, admin));
  assert.equal(response.status, 201); return response;
}
beforeEach(() => {
  data.clear(); revision = 0; writes = 0;
  process.env.NODE_ENV = "production"; delete process.env.TASK_STORE_MODE;
  process.env.ADMIN_EMAILS = "admin@example.com,other@example.com";
  process.env.ADMIN_PASSWORD = oldPassword;
  process.env.ADMIN_SESSION_SECRET = "test-session-secret-32-characters-minimum-only";
  process.env.URL = origin;
  data.set("admin-emails", { etag: "legacy", value: ["stored@example.com"] });
});

test("legacy accounts keep existing credentials, migrate once to salted hashes, and require first-login change", async () => {
  const listed = await accounts.listUsers(); assert.equal(listed.length, 3);
  assert.ok(listed.every((u) => u.role === "admin" && u.mustChangePassword));
  const records = data.get("user-accounts-v1").value;
  assert.equal(new Set(records.map((u) => u.passwordHash)).size, 3);
  for (const user of records) assert.equal(await accounts.verifyPassword(oldPassword, user.passwordHash), true);
  assert.ok(!JSON.stringify(records).includes(oldPassword));
  const count = writes; await accounts.listUsers(); assert.equal(writes, count);
  assert.deepEqual(data.get("admin-emails").value, ["stored@example.com"]);
  const existingCookie = `task_admin_session=${auth.createAdminSessionToken("admin@example.com")}`;
  assert.equal((await auth.getUserSession(new Headers({ cookie: existingCookie }))).mustChangePassword, true);
  assert.equal(await auth.getAdminSession(new Headers({ cookie: existingCookie })), null);
});
test("temporary login is restricted even through direct task, product, user and compatibility API calls", async () => {
  const signed = await signIn("admin@example.com", oldPassword);
  const info = await signed.json(); assert.equal(info.authenticated, true); assert.equal(info.mustChangePassword, true); assert.equal(info.isAdmin, false); assert.equal(info.canManageUsers, false);
  const temporary = cookie(signed);
  assert.equal((await tasks.PATCH(request({ id: "task-1", status: "completed" }, temporary, "PATCH"))).status, 401);
  assert.equal((await tasks.POST(request(seed, temporary))).status, 401);
  assert.equal((await products.POST(request({ name: "منتج" }, temporary))).status, 401);
  assert.equal((await users.GET(request(null, temporary, "GET"))).status, 403);
  assert.equal((await legacy.POST(request({ email: "new@example.com" }, temporary))).status, 403);
});
test("changing password refreshes the session, invalidates the previous token, and removes the old credential", async () => {
  const signed = await signIn("admin@example.com", oldPassword); const previous = cookie(signed);
  const changed = await password.POST(request({ currentPassword: oldPassword, newPassword: personalPassword }, previous));
  assert.equal(changed.status, 200); const info = await changed.json(); assert.equal(info.canManageUsers, true); assert.equal(info.mustChangePassword, false);
  assert.equal(await auth.getUserSession(new Headers({ cookie: previous })), null);
  assert.ok(await auth.getSystemAdminSession(new Headers({ cookie: cookie(changed) })));
  assert.equal((await signIn("admin@example.com", oldPassword)).status, 401);
  assert.equal((await signIn("admin@example.com", personalPassword)).status, 200);
  assert.equal((await password.POST(request({ currentPassword: personalPassword, newPassword: personalPassword }, cookie(changed)))).status, 400);
});
test("creation requires a password and valid role, rejects duplicates, and never exposes hashes", async () => {
  const admin = await adminCookie();
  for (const payload of [{ email: "new@example.com", name: "جديد", role: "viewer" }, { email: "new@example.com", name: "جديد", role: "root", password: temporaryPassword }, { email: "new@example.com", name: "جديد", role: "viewer", password: "short" }])
    assert.equal((await users.POST(request(payload, admin))).status, 400);
  const created = await newUser(admin, "new@example.com", "viewer");
  assert.equal((await created.json()).user.mustChangePassword, true);
  assert.equal((await users.POST(request({ email: " NEW@example.com ", name: "duplicate", role: "viewer", password: temporaryPassword }, admin))).status, 400);
  const list = await (await users.GET(request(null, admin, "GET"))).json();
  assert.ok(list.users.every((u) => !Object.hasOwn(u, "passwordHash") && !Object.hasOwn(u, "password")));
  assert.ok(!JSON.stringify(list).includes(temporaryPassword));
});
test("permission matrix permits editor data changes and restricts account administration to system admins", async () => {
  const admin = await adminCookie();
  for (const role of ["viewer", "editor"]) {
    const email = `${role}@example.com`; await newUser(admin, email, role);
    const first = await signIn(email, temporaryPassword);
    const changed = await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(first)));
    const userCookie = cookie(changed);
    const summary = await (await session.GET(request(null, userCookie, "GET"))).json();
    assert.equal(summary.authenticated, true); assert.equal(summary.role, role); assert.equal(summary.canManageUsers, false);
    assert.equal((await users.GET(request(null, userCookie, "GET"))).status, 403);
    assert.equal((await projects.POST(request({ name: "مشروع ممنوع" }, userCookie))).status, 403);
    assert.equal((await products.PATCH(request({ id: "digital", name: "تعديل ممنوع" }, userCookie, "PATCH"))).status, 403);
    assert.equal((await users.POST(request({ email: "forbidden@example.com", name: "ممنوع", role: "admin", password: temporaryPassword }, userCookie))).status, 403);
    assert.equal((await tasks.PATCH(request({ id: "task-1", status: "review" }, userCookie, "PATCH"))).status, role === "editor" ? 200 : 401);
    assert.equal((await products.POST(request({ name: "منتج المحرر" }, userCookie))).status, role === "editor" ? 201 : 401);
  }
});
test("reset requests conceal account existence, do not change passwords, and deduplicate pending requests", async () => {
  const admin = await adminCookie(); await newUser(admin, "reset@example.com");
  const before = data.get("user-accounts-v1").value.find((u) => u.email === "reset@example.com").passwordHash;
  const known = await reset.POST(request({ email: "reset@example.com" }));
  const unknown = await reset.POST(request({ email: "missing@example.com" }));
  assert.equal(known.status, 200); assert.equal(unknown.status, 200); assert.deepEqual(await known.json(), await unknown.json());
  const after = data.get("user-accounts-v1").value.find((u) => u.email === "reset@example.com");
  assert.equal(after.passwordHash, before); assert.ok(after.resetRequestedAt);
  const count = writes; await reset.POST(request({ email: "reset@example.com" })); assert.equal(writes, count);
  assert.ok((await (await users.GET(request(null, admin, "GET"))).json()).users.find((u) => u.email === "reset@example.com").resetRequestedAt);
});
test("admin reset replaces the credential, revokes sessions, clears the request and requires another first-login change", async () => {
  const admin = await adminCookie(); await newUser(admin, "reset@example.com");
  const first = await signIn("reset@example.com", temporaryPassword);
  const changed = await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(first)));
  const existing = cookie(changed);
  await reset.POST(request({ email: "reset@example.com" }));
  const result = await users.PATCH(request({ email: "reset@example.com", temporaryPassword }, admin, "PATCH"));
  assert.equal(result.status, 200); const user = (await result.json()).user;
  assert.equal(user.mustChangePassword, true); assert.equal(user.resetRequestedAt, null);
  assert.equal(await auth.getUserSession(new Headers({ cookie: existing })), null);
  assert.equal((await signIn("reset@example.com", personalPassword)).status, 401);
  const relogin = await signIn("reset@example.com", temporaryPassword); assert.equal((await relogin.json()).mustChangePassword, true);
  assert.equal(await auth.getAdminSession(new Headers({ cookie: cookie(relogin) })), null);
  assert.equal((await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(relogin)))).status, 200);
});
test("role changes and disabling accounts take effect on existing sessions; self lockout is rejected", async () => {
  const admin = await adminCookie(); await newUser(admin, "editor@example.com");
  const first = await signIn("editor@example.com", temporaryPassword);
  const changed = await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(first)));
  assert.equal((await users.PATCH(request({ email: "editor@example.com", role: "viewer" }, admin, "PATCH"))).status, 200);
  assert.equal(await auth.getUserSession(new Headers({ cookie: cookie(changed) })), null);
  assert.equal((await (await signIn("editor@example.com", personalPassword)).json()).isAdmin, false);
  assert.equal((await users.PATCH(request({ email: "editor@example.com", active: false }, admin, "PATCH"))).status, 200);
  assert.equal((await signIn("editor@example.com", personalPassword)).status, 401);
  assert.equal((await users.PATCH(request({ email: "admin@example.com", active: false }, admin, "PATCH"))).status, 400);
  assert.equal((await users.PATCH(request({ email: "admin@example.com", role: "viewer" }, admin, "PATCH"))).status, 400);
});
test("malformed input, foreign origins, forged and expired sessions are rejected", async () => {
  assert.equal((await login.POST(request("bad-json"))).status, 400);
  assert.equal((await login.POST(request({ email: "admin@example.com", password: oldPassword }, "", "POST", "https://foreign.example"))).status, 403);
  assert.equal((await reset.POST(request({ email: "admin@example.com" }, "", "POST", null))).status, 403);
  const admin = await adminCookie();
  assert.equal((await users.POST(request({ email: "x@example.com", name: "x", role: "viewer", password: temporaryPassword }, admin, "POST", "https://foreign.example"))).status, 403);
  assert.equal(await auth.getUserSession(new Headers({ cookie: admin + "tampered" })), null);
  const payload = Buffer.from(JSON.stringify({ email: "admin@example.com", sessionVersion: 1, expiresAt: 1 })).toString("base64url");
  const signature = require("node:crypto").createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(payload).digest("base64url");
  assert.equal(await auth.getUserSession(new Headers({ cookie: `task_admin_session=${payload}.${signature}` })), null);
});
test("repeated failed logins are temporarily locked and admin reset restores access", async () => {
  const admin = await adminCookie(); await newUser(admin, "locked@example.com");
  for (let i = 0; i < 5; i++) assert.equal((await signIn("locked@example.com", "wrong-password")).status, 401);
  assert.equal((await signIn("locked@example.com", temporaryPassword)).status, 401);
  assert.equal((await users.PATCH(request({ email: "locked@example.com", temporaryPassword }, admin, "PATCH"))).status, 200);
  assert.equal((await signIn("locked@example.com", temporaryPassword)).status, 200);
});
test("concurrent account creation does not overwrite another user's account", async () => {
  const admin = await adminCookie();
  await Promise.all([newUser(admin, "one@example.com"), newUser(admin, "two@example.com")]);
  const listed = await accounts.listUsers(); assert.ok(listed.some((u) => u.email === "one@example.com")); assert.ok(listed.some((u) => u.email === "two@example.com"));
});
