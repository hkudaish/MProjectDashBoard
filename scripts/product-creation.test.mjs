import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { beforeEach, test } from "node:test";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const records = new Map();
let admin = true;
let role = "admin";
let reads = 0;
let writes = 0;
const seed = { id: "existing", productId: "digital", productName: "المحتوى الرقمي", title: "المهمة الحالية", plannedDate: "2026-10-01", endDate: "2026-10-08", status: "completed", progress: 100, ownerType: "wamy", assignee: "", notes: "", sourceOrder: 1, updatedAt: "2026-10-01" };
const stubs = {
  "@/lib/task-assignment": { normalizeTaskAssignments: async (actor, task) => task, normalizeProductDetails: async (actor, details) => details, taskPermissions: () => ({ canEdit: true, canEditMain: true, canUpdateMain: true, canAssign: true, editableDetailIds: [] }), TaskPolicyError: class extends Error {} },
  "@/lib/user-accounts": { listUsers: async () => [] },
  "zod": { z: createRequire(import.meta.url)("zod").z },
  "@netlify/blobs": { getStore: () => ({ async get(key) { reads++; return structuredClone(records.get(key)); }, async setJSON(key, value) { writes++; records.set(key, structuredClone(value)); } }) },
  "@/lib/admin-auth": { getUserSession: async () => admin ? { email: "admin@example.com", position: "system_admin" } : null, getAdminSession: async () => admin ? { email: "admin@example.com", role, position: role === "admin" ? "system_admin" : "project_manager" } : null,
    getSystemAdminSession: async () => admin && role === "admin" ? { email: "admin@example.com", role, position: role === "admin" ? "system_admin" : "project_manager" } : null,
    hasSameOrigin: (request) => request.headers.get("origin") === "https://example.com" },
  "@/lib/task-data": { DEFAULT_TASKS: [seed] },
};
const cache = new Map();
async function load(path) {
  if (cache.has(path)) return cache.get(path);
  const sourceModule = new vm.SourceTextModule(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  const linked = sourceModule.link(async (specifier) => {
    if (stubs[specifier]) {
      const values = stubs[specifier];
      return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); });
    }
    const dependency = specifier.startsWith("@/") ? resolve(root, specifier.slice(2) + ".ts") : resolve(dirname(path), specifier + ".ts");
    return load(dependency);
  });
  const ready = linked.then(() => sourceModule);
  cache.set(path, ready);
  return ready;
}
process.env.NODE_ENV = "production";
delete process.env.TASK_STORE_MODE;
const products = await load(resolve(root, "app/api/products/route.ts"));
await products.evaluate();
const tasks = await load(resolve(root, "app/api/tasks/route.ts"));
await tasks.evaluate();
const detail = { id: "detail", description: "تقرير جديد", status: "review", completionDate: "2026-10-08", ownerType: "vendor", assignee: "المسؤول" };
const request = (payload, method = "POST") => new Request("https://example.com/api", { method, headers: { "Content-Type": "application/json", Origin: "https://example.com" }, body: JSON.stringify(payload) });
beforeEach(() => { admin = true; role = "admin"; reads = 0; writes = 0; records.clear(); records.set("tasks", [structuredClone(seed)]); });
test("product creation is admin-only and leaves data untouched for visitors", async () => {
  admin = false;
  assert.equal((await products.namespace.POST(request({ name: "منتج" }))).status, 401);
  assert.equal(reads, 0); assert.equal(writes, 0);
});
test("product survives subsequent reads with details and can own new tasks", async () => {
  const response = await products.namespace.POST(request({ name: "منتج جديد", target: "5 تقارير", description: "الوصف", details: [detail] }));
  assert.equal(response.status, 201);
  const product = (await response.json()).product;
  assert.equal((await (await products.namespace.GET()).json()).products.length, 5);
  assert.deepEqual((await (await products.namespace.GET()).json()).products.find((p) => p.id === product.id), product);
  const created = await tasks.namespace.POST(request({ ...seed, productId: product.id, details: [detail], status: "in_progress" }));
  assert.equal(created.status, 201);
  const task = (await created.json()).task;
  assert.equal(task.productName, product.name); assert.equal(task.progress, 50);
  assert.deepEqual((await (await tasks.namespace.GET()).json()).tasks.find((t) => t.id === task.id).details, [detail]);
  assert.deepEqual(records.get("tasks")[0], seed);
  assert.equal((await (await products.namespace.GET()).json()).products.length, 5);
});
test("duplicate products and invalid details never write records", async () => {
  assert.equal((await products.namespace.POST(request({ name: "المحتوى الرقمي" }))).status, 409);
  for (const payload of [{ name: " " }, { name: "جديد", details: [{ ...detail, completionDate: "2026-02-30" }] }])
    assert.equal((await products.namespace.POST(request(payload))).status, 400);
  assert.equal(writes, 0);
});
test("development stores persist across separate store instances", async () => {
  process.env.TASK_STORE_MODE = "memory";
  try {
    const productStore = (await cache.get(resolve(root, "lib/product-store.ts"))).namespace;
    const taskStore = (await cache.get(resolve(root, "lib/task-store.ts"))).namespace;
    const product = { id: "local", projectId: "media-project", name: "محلي", target: "", description: "", details: [detail] };
    await productStore.createProductStore().setProducts([product]);
    assert.deepEqual((await productStore.createProductStore().getProducts()).find((p) => p.id === "local"), product);
    await taskStore.createTaskStore().setTasks([seed]);
    assert.deepEqual(await taskStore.createTaskStore().getTasks(), [seed]);
  } finally { delete process.env.TASK_STORE_MODE; }
});

const projects = await load(resolve(root, "app/api/projects/route.ts"));
await projects.evaluate();
test("new projects persist and products and tasks keep their distinct parent relationships", async () => {
  const response = await projects.namespace.POST(request({ name: "مشروع جديد", description: "الوصف" }));
  assert.equal(response.status, 201);
  const project = (await response.json()).project;
  assert.equal((await (await projects.namespace.GET()).json()).projects.length, 2);
  const productResponse = await products.namespace.POST(request({ name: "المحتوى الرقمي", projectId: project.id, details: [detail] }));
  assert.equal(productResponse.status, 201); const product = (await productResponse.json()).product;
  assert.equal(product.projectId, project.id);
  const taskResponse = await tasks.namespace.POST(request({ ...seed, productId: product.id, details: [detail] }));
  assert.equal(taskResponse.status, 201);
  const task = (await taskResponse.json()).task;
  assert.equal(task.productId, product.id);
  assert.equal((await (await products.namespace.GET()).json()).products.filter((p) => p.projectId === project.id).length, 1);
  assert.deepEqual(records.get("tasks")[0], seed);
  assert.deepEqual((await (await tasks.namespace.GET()).json()).tasks.find((t) => t.id === task.id).details, [detail]);
});
test("renaming seeded projects and products survives reloads and reports use the current product name", async () => {
  assert.equal((await projects.namespace.PATCH(request({ id: "media-project", name: "الاسم الجديد", description: "" }, "PATCH"))).status, 200);
  assert.equal((await (await projects.namespace.GET()).json()).projects.find((p) => p.id === "media-project").name, "الاسم الجديد");
  const response = await products.namespace.PATCH(request({ id: "digital", name: "اسم المنتج الجديد" }, "PATCH"));
  assert.equal(response.status, 200);
  const product = (await response.json()).product;
  assert.equal(product.target, "188 بوست");
  assert.equal((await (await products.namespace.GET()).json()).products.find((p) => p.id === "digital").name, product.name);
  assert.equal((await (await tasks.namespace.GET()).json()).tasks[0].productName, product.name);
  assert.deepEqual(records.get("tasks"), [seed]);
  assert.equal((await tasks.namespace.PATCH(request({ id: seed.id, title: "عنوان المهمة الجديد" }, "PATCH"))).status, 200);
  assert.equal((await (await tasks.namespace.GET()).json()).tasks[0].title, "عنوان المهمة الجديد");
  assert.equal(records.get("tasks")[0].productId, seed.productId);
});
test("renaming custom products preserves descriptions, detail rows and project membership", async () => {
  const created = await products.namespace.POST(request({ name: "منتج جديد", description: "وصف", details: [detail] }));
  const product = (await created.json()).product;
  assert.equal((await products.namespace.PATCH(request({ id: product.id, name: "منتج معدل", projectId: "attempted-move" }, "PATCH"))).status, 200);
  const read = (await (await products.namespace.GET()).json()).products.find((p) => p.id === product.id);
  assert.equal(read.name, "منتج معدل"); assert.equal(read.description, "وصف"); assert.equal(read.projectId, "media-project"); assert.deepEqual(read.details, [detail]);
});
test("project creation and structural renames are restricted to system administrators", async () => {
  for (const actor of ["editor", "anonymous"]) {
    role = actor; admin = actor !== "anonymous";
    assert.equal((await projects.namespace.POST(request({ name: "ممنوع" }))).status, 403);
    assert.equal((await projects.namespace.PATCH(request({ id: "media-project", name: "ممنوع" }, "PATCH"))).status, 403);
    assert.equal((await products.namespace.PATCH(request({ id: "digital", name: "ممنوع" }, "PATCH"))).status, 403);
  }
  assert.equal(writes, 0); assert.equal(reads, 0);
});
test("invalid parents, duplicate names and blank renamed titles are rejected without writing data", async () => {
  assert.equal((await products.namespace.POST(request({ name: "منتج", projectId: "unknown" }))).status, 400);
  assert.equal((await projects.namespace.POST(request({ name: "المشروع الإعلامي" }))).status, 409);
  assert.equal((await products.namespace.PATCH(request({ id: "digital", name: "الإنفوجرافيك" }, "PATCH"))).status, 409);
  assert.equal((await products.namespace.PATCH(request({ id: "missing", name: "منتج" }, "PATCH"))).status, 404);
  assert.equal((await projects.namespace.PATCH(request({ id: "missing", name: "مشروع" }, "PATCH"))).status, 404);
  assert.equal((await tasks.namespace.PATCH(request({ id: seed.id, title: " " }, "PATCH"))).status, 400);
  assert.equal(writes, 0);
});
