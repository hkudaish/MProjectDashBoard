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
  const position = email === "test-manager@example.com" ? "department_manager" : role === "admin" ? "system_admin" : role === "editor" ? "project_manager" : "employee";
  if (position === "employee" && !await accounts.findAccount("test-manager@example.com")) await newUser(admin, "test-manager@example.com");
  const response = await users.POST(request({ email, name: "User", position, managerEmail: position === "system_admin" ? null : position === "employee" ? "test-manager@example.com" : "admin@example.com", entityId: position === "system_admin" ? null : "wamy", password: temporaryPassword }, admin));
  assert.equal(response.status, 201, await response.clone().text()); return response;
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
    if (role === "editor") data.set("tasks", { etag: "task", value: [{ ...seed, createdByEmail: email }] });
    assert.equal((await tasks.PATCH(request({ id: "task-1", status: "review" }, userCookie, "PATCH"))).status, role === "editor" ? 200 : 403);
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
  const admin = await adminCookie(); await newUser(admin, "editor@example.com"); await newUser(admin, "test-manager@example.com");
  const first = await signIn("editor@example.com", temporaryPassword);
  const changed = await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(first)));
  assert.equal((await users.PATCH(request({ email: "editor@example.com", position: "employee", managerEmail: "test-manager@example.com", entityId: "wamy" }, admin, "PATCH"))).status, 200);
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

const directory = await exports("app/api/users/directory/route.ts");
const entities = await exports("app/api/entities/route.ts");
async function positioned(admin, email, position, managerEmail, entityId = "wamy") {
  const response = await users.POST(request({ email, name: email, position, managerEmail, entityId, password: temporaryPassword }, admin));
  assert.equal(response.status, 201, await response.clone().text()); return (await response.json()).user;
}
async function personalCookie(email) {
  const signed = await signIn(email, temporaryPassword);
  const changed = await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(signed)));
  assert.equal(changed.status, 200); return cookie(changed);
}
async function tree(admin) {
  await positioned(admin, "department@example.com", "department_manager", "admin@example.com");
  await positioned(admin, "section@example.com", "section_head", "department@example.com");
  await positioned(admin, "staff@example.com", "employee", "section@example.com");
  await positioned(admin, "outside@example.com", "department_manager", "admin@example.com");
  await positioned(admin, "otherstaff@example.com", "employee", "outside@example.com");
}
test("hierarchy requires valid positions, supervisors and entities and protects dependent users", async () => {
  const admin = await adminCookie(); await tree(admin);
  for (const fields of [
    { position: "employee", managerEmail: "admin@example.com", entityId: "wamy" },
    { position: "section_head", managerEmail: "admin@example.com", entityId: "wamy" },
    { position: "department_manager", managerEmail: "admin@example.com", entityId: null },
    { position: "system_admin", managerEmail: "admin@example.com", entityId: null },
    { position: "project_manager", managerEmail: "admin@example.com", entityId: "missing" },
  ]) assert.equal((await users.POST(request({ email: "bad@example.com", name: "Bad", password: temporaryPassword, ...fields }, admin))).status, 400);
  const before = data.get("user-accounts-v1").value.find((user) => user.email === "section@example.com").passwordHash;
  assert.equal((await users.PATCH(request({ email: "department@example.com", active: false }, admin, "PATCH"))).status, 400);
  assert.equal((await users.PATCH(request({ email: "department@example.com", position: "project_manager" }, admin, "PATCH"))).status, 400);
  assert.equal((await users.PATCH(request({ email: "staff@example.com", managerEmail: "staff@example.com" }, admin, "PATCH"))).status, 400);
  await positioned(admin, "seconddepartment@example.com", "department_manager", "admin@example.com");
  assert.equal((await users.PATCH(request({ email: "section@example.com", managerEmail: "seconddepartment@example.com" }, admin, "PATCH"))).status, 200);
  assert.equal(data.get("user-accounts-v1").value.find((user) => user.email === "section@example.com").passwordHash, before);
});
test("managers can assign to all descendants and employees can update only their assigned work", async () => {
  const admin = await adminCookie(); await tree(admin);
  const manager = await personalCookie("department@example.com");
  const staff = await personalCookie("staff@example.com");
  const scoped = await (await directory.GET(request(null, manager, "GET"))).json();
  assert.deepEqual(scoped.assignableUsers.map((user) => user.email).sort(), ["section@example.com", "staff@example.com"]);
  const detail = { id: "own-row", description: "Detail", status: "not_started", completionDate: "", ownerType: "wamy", assignee: "forged name", assigneeEmail: "staff@example.com" };
  const created = await tasks.POST(request({ ...seed, title: "Assigned task", assignee: "forged name", assigneeEmail: "staff@example.com", details: [detail] }, manager));
  assert.equal(created.status, 201, await created.clone().text()); const task = (await created.json()).task;
  assert.equal(task.assignee, "staff@example.com"); assert.equal(task.details[0].assignee, "staff@example.com");
  assert.equal((await tasks.PATCH(request({ id: task.id, assigneeEmail: "otherstaff@example.com", assignee: "otherstaff@example.com" }, manager, "PATCH"))).status, 403);
  assert.equal((await tasks.POST(request({ ...seed, title: "Outside task", assigneeEmail: "otherstaff@example.com" }, manager))).status, 403);
  assert.equal((await tasks.PATCH(request({ id: task.id, status: "review" }, staff, "PATCH"))).status, 200);
  assert.equal((await tasks.PATCH(request({ id: task.id, title: "Changed title" }, staff, "PATCH"))).status, 403);
  assert.equal((await tasks.PATCH(request({ id: task.id, details: [{ ...task.details[0], status: "completed", completionDate: "2026-10-08" }] }, staff, "PATCH"))).status, 200);
  assert.equal((await tasks.PATCH(request({ id: task.id, details: [{ ...task.details[0], description: "Forged" }] }, staff, "PATCH"))).status, 403);
  assert.equal((await tasks.PATCH(request({ id: task.id, details: [] }, staff, "PATCH"))).status, 403);
  const anonymous = await (await tasks.GET()).json();
  assert.ok(anonymous.tasks.every((item) => !Object.hasOwn(item, "assigneeEmail") && !Object.hasOwn(item, "createdByEmail")));
  assert.ok(!JSON.stringify(scoped).includes("passwordHash"));
});
test("detail assignments preserve protected rows and scope follows administrative reparenting", async () => {
  const admin = await adminCookie(); await tree(admin);
  const manager = await personalCookie("department@example.com");
  const row = (id, email) => ({ id, description: id, status: "not_started", completionDate: "", ownerType: "wamy", assignee: "", assigneeEmail: email });
  const created = await tasks.POST(request({ ...seed, assigneeEmail: "section@example.com", details: [row("own", "staff@example.com"), row("protected", "otherstaff@example.com")] }, admin));
  assert.equal(created.status, 201); const task = (await created.json()).task;
  assert.equal((await tasks.PATCH(request({ id: task.id, details: task.details.map((detail) => detail.id === "protected" ? { ...detail, status: "completed" } : detail) }, manager, "PATCH"))).status, 403);
  assert.equal((await tasks.PATCH(request({ id: task.id, details: [task.details[0]] }, manager, "PATCH"))).status, 403);
  assert.equal((await tasks.PATCH(request({ id: task.id, details: task.details.map((detail) => detail.id === "own" ? { ...detail, status: "review" } : detail) }, manager, "PATCH"))).status, 200);
  await positioned(admin, "seconddepartment@example.com", "department_manager", "admin@example.com");
  assert.equal((await users.PATCH(request({ email: "section@example.com", managerEmail: "seconddepartment@example.com" }, admin, "PATCH"))).status, 200);
  assert.equal((await tasks.PATCH(request({ id: task.id, status: "completed" }, manager, "PATCH"))).status, 403);
  assert.deepEqual((await (await directory.GET(request(null, manager, "GET"))).json()).assignableUsers, []);
});
test("entity creation, rename, hiding and deletion retain linked records and validate project membership", async () => {
  const admin = await adminCookie();
  const added = await entities.POST(request({ name: "New Entity", description: "Original" }, admin)); assert.equal(added.status, 201);
  const entity = (await added.json()).entity;
  assert.equal((await entities.PATCH(request({ id: entity.id, name: "Renamed Entity" }, admin, "PATCH"))).status, 200);
  const project = await projects.POST(request({ name: "Entity Project", entityIds: [entity.id] }, admin)); assert.equal(project.status, 201);
  assert.equal((await entities.DELETE(request({ id: entity.id }, admin, "DELETE"))).status, 409);
  assert.equal((await entities.PATCH(request({ id: entity.id, hidden: true }, admin, "PATCH"))).status, 200);
  assert.ok(!(await (await entities.GET(request(null, "", "GET"))).json()).entities.some((item) => item.id === entity.id));
  assert.ok((await (await entities.GET(request(null, admin, "GET"))).json()).entities.some((item) => item.id === entity.id && item.hidden));
  assert.equal((await projects.POST(request({ name: "Invalid Project", entityIds: [entity.id] }, admin))).status, 400);
  const current = (await project.json()).project;
  assert.equal((await projects.PATCH(request({ id: current.id, name: "Renamed Project", entityIds: [entity.id] }, admin, "PATCH"))).status, 200);
  assert.equal((await users.POST(request({ email: "hidden@example.com", name: "Hidden", position: "project_manager", managerEmail: "admin@example.com", entityId: entity.id, password: temporaryPassword }, admin))).status, 400);
  const unused = await entities.POST(request({ name: "Unused" }, admin)); const unusedId = (await unused.json()).entity.id;
  assert.equal((await entities.DELETE(request({ id: unusedId }, admin, "DELETE"))).status, 200);
  assert.ok(!(await (await entities.GET(request(null, admin, "GET"))).json()).entities.some((item) => item.id === unusedId));
  assert.equal((await entities.POST(request({ name: "Forbidden" }))).status, 403);
});
test("existing salted credentials and active sessions survive the addition of hierarchy fields", async () => {
  const admin = await adminCookie(); const raw = data.get("user-accounts-v1").value;
  const previous = structuredClone(raw.find((user) => user.email === "admin@example.com"));
  for (const user of raw) { delete user.position; delete user.managerEmail; delete user.entityId; }
  data.set("user-accounts-v1", { etag: "legacy-no-hierarchy", value: raw });
  const active = await auth.getSystemAdminSession(new Headers({ cookie: admin })); assert.equal(active.position, "system_admin");
  const account = await accounts.findAccount("admin@example.com"); assert.equal(account.passwordHash, previous.passwordHash); assert.equal(account.sessionVersion, previous.sessionVersion);
  assert.equal((await signIn("admin@example.com", personalPassword)).status, 200);
});

test("updating the system director's display name preserves their active session and credential", async () => {
  const admin = await adminCookie(); const before = await accounts.findAccount("admin@example.com");
  assert.equal((await users.PATCH(request({ email: "admin@example.com", name: "Updated Director", position: "system_admin", managerEmail: null, entityId: null }, admin, "PATCH"))).status, 200);
  const after = await accounts.findAccount("admin@example.com"); assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.sessionVersion, before.sessionVersion);
  assert.equal((await auth.getSystemAdminSession(new Headers({ cookie: admin }))).name, "Updated Director");
});

test("changing login email preserves assignments, reporting links and passwords, and revokes old sessions", async () => {
  const admin = await adminCookie(); await tree(admin);
  const managerCookie = await personalCookie("department@example.com");
  const before = await accounts.findAccount("department@example.com");
  const created = await tasks.POST(request({ ...seed, title: "History", assigneeEmail: "department@example.com", assignee: "" }, admin)); assert.equal(created.status, 201); const task = (await created.json()).task;
  const renamed = await users.PATCH(request({ email: "department@example.com", newEmail: "RENAMED@example.com", name: "Renamed Manager" }, admin, "PATCH")); assert.equal(renamed.status, 200);
  const after = await accounts.findAccount("department@example.com"); assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.loginEmail, "renamed@example.com");
  assert.equal((await accounts.findAccount("section@example.com")).managerEmail, "department@example.com");
  assert.equal(await auth.getUserSession(new Headers({ cookie: managerCookie })), null);
  assert.equal((await signIn("department@example.com", personalPassword)).status, 401);
  const signed = await signIn("renamed@example.com", personalPassword); assert.equal(signed.status, 200); assert.equal((await signed.clone().json()).loginEmail, "renamed@example.com");
  assert.equal((await tasks.PATCH(request({ id: task.id, status: "review" }, cookie(signed), "PATCH"))).status, 200);
  assert.deepEqual((await (await directory.GET(request(null, cookie(signed), "GET"))).json()).assignableUsers.map(user=>user.email).sort(), ["section@example.com", "staff@example.com"]);
  assert.equal((await reset.POST(request({ email: "renamed@example.com" }))).status, 200); assert.ok((await accounts.findAccount("department@example.com")).resetRequestedAt);
  assert.equal((await users.PATCH(request({ email: "department@example.com", newEmail: "outside@example.com" }, admin, "PATCH"))).status, 400);
});
test("system director can change their login email without being locked out", async () => {
  const admin = await adminCookie();
  const changed = await users.PATCH(request({ email: "admin@example.com", newEmail: "director@example.com" }, admin, "PATCH")); assert.equal(changed.status, 200);
  assert.equal(await auth.getUserSession(new Headers({ cookie: admin })), null);
  assert.ok(await auth.getSystemAdminSession(new Headers({ cookie: cookie(changed) })));
  assert.equal((await signIn("director@example.com", personalPassword)).status, 200);
  assert.equal((await signIn("admin@example.com", personalPassword)).status, 401);
});
test("account deletion removes login access while preserving task history and preventing identity reuse", async () => {
  const admin = await adminCookie(); await tree(admin); const staffCookie=await personalCookie("staff@example.com");
  const row={id:"historical-row",description:"Historical detail",status:"review",completionDate:"",ownerType:"wamy",assignee:"",assigneeEmail:"staff@example.com"};
  const created=await tasks.POST(request({...seed,assignee:"",assigneeEmail:"staff@example.com",details:[row]},admin));assert.equal(created.status,201);const task=(await created.json()).task;
  const storedBefore=structuredClone(data.get("tasks").value);
  assert.equal((await users.DELETE(request({email:"staff@example.com"},admin,"DELETE"))).status,200);
  assert.equal(await auth.getUserSession(new Headers({cookie:staffCookie})),null);
  assert.equal((await signIn("staff@example.com",personalPassword)).status,401);
  assert.ok(!(await accounts.listUsers()).some(user=>user.email==="staff@example.com"));
  assert.equal(data.get("user-accounts-v1").value.find(user=>user.email==="staff@example.com").passwordHash,"");
  assert.deepEqual(data.get("tasks").value,storedBefore);
  assert.equal((await tasks.PATCH(request({id:task.id,notes:"History remains editable"},admin,"PATCH"))).status,200);
  assert.equal((await users.POST(request({email:"staff@example.com",name:"Reused",position:"employee",managerEmail:"section@example.com",entityId:"wamy",password:temporaryPassword},admin))).status,400);
});
test("account deletion protects supervisors and self and is restricted to the system director", async () => {
  const admin=await adminCookie();await tree(admin);const manager=await personalCookie("department@example.com");
  assert.equal((await users.DELETE(request({email:"section@example.com"},admin,"DELETE"))).status,400);
  assert.equal((await users.DELETE(request({email:"admin@example.com"},admin,"DELETE"))).status,400);
  assert.equal((await users.DELETE(request({email:"staff@example.com"},manager,"DELETE"))).status,403);
  assert.equal((await users.DELETE(request({email:"staff@example.com"},admin,"DELETE","https://foreign.example"))).status,403);
  assert.equal((await users.DELETE(request("invalid-json",admin,"DELETE"))).status,400);
  assert.equal((await users.DELETE(request({email:"missing@example.com"},admin,"DELETE"))).status,400);
});

const hierarchy = await exports("lib/hierarchy.ts");
test("employees report to section heads or departments, with the complete chain shown in order", async () => {
  const admin=await adminCookie();await tree(admin);
  await positioned(admin,"project@example.com","project_manager","admin@example.com");
  const listed=await accounts.listUsers();
  const options=hierarchy.managerOptions(listed,"employee");
  assert.ok(options.some(user=>user.email==="section@example.com"));assert.ok(options.some(user=>user.email==="department@example.com"));
  assert.ok(!options.some(user=>user.position==="project_manager"||user.position==="system_admin"||user.position==="employee"));
  assert.deepEqual(hierarchy.supervisorChain(listed,"section@example.com").map(user=>user.position),["system_admin","department_manager","section_head"]);
  assert.equal((await users.POST(request({email:"invalidstaff@example.com",name:"Invalid",position:"employee",managerEmail:"project@example.com",entityId:"wamy",password:temporaryPassword},admin))).status,400);
  assert.equal((await users.PATCH(request({email:"staff@example.com",managerEmail:"project@example.com"},admin,"PATCH"))).status,400);
  assert.equal((await users.PATCH(request({email:"staff@example.com",managerEmail:"department@example.com"},admin,"PATCH"))).status,200);
  const current=await accounts.listUsers();assert.deepEqual(hierarchy.supervisorChain(current,(await accounts.findAccount("staff@example.com")).managerEmail).map(user=>user.position),["system_admin","department_manager"]);
  assert.ok(hierarchy.subordinateUsers(current,"department@example.com").some(user=>user.email==="staff@example.com"));
  assert.ok(!hierarchy.subordinateUsers(current,"section@example.com").some(user=>user.email==="staff@example.com"));
});
test("legacy employee/project links are repairable without granting project managers assignment scope", async () => {
  const admin=await adminCookie();await tree(admin);await positioned(admin,"project@example.com","project_manager","admin@example.com");
  const previousHash=(await accounts.findAccount("staff@example.com")).passwordHash;
  const rows=data.get("user-accounts-v1").value;rows.find(user=>user.email==="staff@example.com").managerEmail="project@example.com";
  data.set("user-accounts-v1",{etag:"legacy-project-link",value:rows});
  const manager=await personalCookie("project@example.com");
  assert.deepEqual((await(await directory.GET(request(null,manager,"GET"))).json()).assignableUsers,[]);
  assert.equal((await tasks.POST(request({...seed,assigneeEmail:"staff@example.com",assignee:""},manager))).status,403);
  await positioned(admin,"newdepartment@example.com","department_manager","admin@example.com");
  assert.equal((await users.PATCH(request({email:"staff@example.com",managerEmail:"section@example.com"},admin,"PATCH"))).status,200);
  assert.equal((await accounts.findAccount("staff@example.com")).passwordHash,previousHash);
});

test("employee dual reporting grants both administrative branches scope and removing the extra link revokes it", async () => {
  const admin=await adminCookie();await tree(admin);const outside=await personalCookie("outside@example.com");
  const updated=await users.PATCH(request({email:"staff@example.com",managerPosition:"both",additionalManagerEmail:"outside@example.com"},admin,"PATCH"));assert.equal(updated.status,200);assert.equal((await updated.json()).user.additionalManagerEmail,"outside@example.com");
  const directoryData=await(await directory.GET(request(null,outside,"GET"))).json();assert.ok(directoryData.assignableUsers.some(user=>user.email==="staff@example.com"));assert.ok(!directoryData.assignableUsers.some(user=>user.email==="section@example.com"));
  const created=await tasks.POST(request({...seed,title:"Dual assignment",assignee:"",assigneeEmail:"staff@example.com"},outside));assert.equal(created.status,201);const task=(await created.json()).task;
  assert.equal((await users.PATCH(request({email:"outside@example.com",active:false},admin,"PATCH"))).status,400);
  assert.equal((await users.DELETE(request({email:"outside@example.com"},admin,"DELETE"))).status,400);
  assert.equal((await users.PATCH(request({email:"staff@example.com",managerPosition:"section_head",additionalManagerEmail:null},admin,"PATCH"))).status,200);
  assert.ok(!(await(await directory.GET(request(null,outside,"GET"))).json()).assignableUsers.some(user=>user.email==="staff@example.com"));
  assert.equal((await tasks.PATCH(request({id:task.id,status:"completed"},outside,"PATCH"))).status,403);
  assert.ok(hierarchy.subordinateUsers(await accounts.listUsers(),"department@example.com").some(user=>user.email==="staff@example.com"));
});
test("dual reporting requires a section head and a department manager and cannot be forged for other positions", async () => {
  const admin=await adminCookie();await tree(admin);
  for(const changes of [
    {email:"staff@example.com",managerPosition:"both",additionalManagerEmail:null},
    {email:"staff@example.com",additionalManagerEmail:"section@example.com"},
    {email:"staff@example.com",managerPosition:"department_manager"},
    {email:"staff@example.com",managerEmail:"department@example.com",additionalManagerEmail:"outside@example.com"},
    {email:"section@example.com",additionalManagerEmail:"outside@example.com"},
    {email:"admin@example.com",additionalManagerEmail:"outside@example.com"}
  ])assert.equal((await users.PATCH(request(changes,admin,"PATCH"))).status,400);
  const created=await users.POST(request({email:"dual@example.com",name:"Dual Employee",position:"employee",managerPosition:"both",managerEmail:"section@example.com",additionalManagerEmail:"outside@example.com",entityId:"wamy",password:temporaryPassword},admin));assert.equal(created.status,201);
  assert.equal((await users.POST(request({email:"incomplete@example.com",name:"Incomplete",position:"employee",managerPosition:"both",managerEmail:"section@example.com",entityId:"wamy",password:temporaryPassword},admin))).status,400);
  assert.equal((await users.PATCH(request({email:"dual@example.com",position:"section_head",managerEmail:"department@example.com"},admin,"PATCH"))).status,400);
  assert.equal((await users.PATCH(request({email:"dual@example.com",position:"section_head",managerEmail:"department@example.com",additionalManagerEmail:null},admin,"PATCH"))).status,200);
});

test("task assignment lists exclude system directors and remain scoped to registered reporting relationships", async () => {
  const admin=await adminCookie();await tree(admin);
  await positioned(admin,"project@example.com","project_manager","admin@example.com");
  await positioned(admin,"otherdepartment@example.com","department_manager","other@example.com");
  const rootDirectory=await(await directory.GET(request(null,admin,"GET"))).json();
  assert.ok(rootDirectory.assignableUsers.some(user=>user.email==="project@example.com"));
  assert.ok(rootDirectory.assignableUsers.some(user=>user.email==="staff@example.com"));
  assert.ok(rootDirectory.assignableUsers.every(user=>user.position!=="system_admin"));
  assert.ok(!rootDirectory.assignableUsers.some(user=>user.email==="otherdepartment@example.com"));
  const department=await personalCookie("department@example.com");const section=await personalCookie("section@example.com");const project=await personalCookie("project@example.com");const employee=await personalCookie("staff@example.com");
  assert.deepEqual((await(await directory.GET(request(null,department,"GET"))).json()).assignableUsers.map(user=>user.email).sort(),["section@example.com","staff@example.com"]);
  assert.deepEqual((await(await directory.GET(request(null,section,"GET"))).json()).assignableUsers.map(user=>user.email),["staff@example.com"]);
  assert.deepEqual((await(await directory.GET(request(null,project,"GET"))).json()).assignableUsers,[]);
  assert.deepEqual((await(await directory.GET(request(null,employee,"GET"))).json()).assignableUsers,[]);
  assert.equal((await tasks.POST(request({...seed,assigneeEmail:"otherdepartment@example.com",assignee:""},admin))).status,403);
});
test("system directors cannot be selected as task or detail assignees even through direct API calls", async () => {
  const admin=await adminCookie();await tree(admin);
  const row={id:"root-row",description:"Forbidden root assignment",status:"not_started",completionDate:"",ownerType:"wamy",assignee:"",assigneeEmail:"admin@example.com"};
  for(const email of ["admin@example.com","other@example.com"])assert.equal((await tasks.POST(request({...seed,assigneeEmail:email,assignee:""},admin))).status,403);
  assert.equal((await tasks.POST(request({...seed,details:[row]},admin))).status,403);
  assert.equal((await products.POST(request({name:"Root assigned product",details:[row]},admin))).status,403);
  const created=await tasks.POST(request({...seed,assigneeEmail:"staff@example.com",assignee:""},admin));assert.equal(created.status,201);const task=(await created.json()).task;
  assert.equal((await tasks.PATCH(request({id:task.id,assigneeEmail:"admin@example.com",assignee:""},admin,"PATCH"))).status,403);
  assert.equal((await tasks.PATCH(request({id:task.id,details:[row]},admin,"PATCH"))).status,403);
  assert.equal(data.get("tasks").value.find(item=>item.id===task.id).assigneeEmail,"staff@example.com");
});
test("the task assignee is independent of the user's administrative supervisor", async () => {
  const admin=await adminCookie();await tree(admin);const section=await personalCookie("section@example.com");
  const before=await accounts.findAccount("staff@example.com");
  const created=await tasks.POST(request({...seed,assigneeEmail:"staff@example.com",assignee:""},section));assert.equal(created.status,201);const task=(await created.json()).task;
  assert.equal(task.assigneeEmail,"staff@example.com");assert.notEqual(task.assigneeEmail,before.managerEmail);
  assert.equal((await accounts.findAccount("staff@example.com")).managerEmail,before.managerEmail);
  assert.equal((await tasks.PATCH(request({id:task.id,assigneeEmail:"department@example.com",assignee:""},section,"PATCH"))).status,403);
});
