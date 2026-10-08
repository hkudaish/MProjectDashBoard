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
let reads = 0;
let writes = 0;
const seed = { id: "existing", productId: "digital", productName: "المحتوى الرقمي", title: "المهمة الحالية", plannedDate: "2026-10-01", endDate: "2026-10-08", status: "completed", progress: 100, ownerType: "wamy", assignee: "", notes: "", sourceOrder: 1, updatedAt: "2026-10-01" };
const stubs = {
  "zod": { z: createRequire(import.meta.url)("zod").z },
  "@netlify/blobs": { getStore: () => ({ async get(key) { reads++; return structuredClone(records.get(key)); }, async setJSON(key, value) { writes++; records.set(key, structuredClone(value)); } }) },
  "@/lib/admin-auth": { getAdminSession: async () => admin ? { email: "admin@example.com" } : null },
  "@/lib/task-data": { DEFAULT_TASKS: [seed] },
};
const cache = new Map();
async function load(path) {
  if (cache.has(path)) return cache.get(path);
  const sourceModule = new vm.SourceTextModule(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  cache.set(path, sourceModule);
  await sourceModule.link(async (specifier) => {
    if (stubs[specifier]) {
      const values = stubs[specifier];
      return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); });
    }
    const dependency = specifier.startsWith("@/") ? resolve(root, specifier.slice(2) + ".ts") : resolve(dirname(path), specifier + ".ts");
    return load(dependency);
  });
  return sourceModule;
}
process.env.NODE_ENV = "production";
delete process.env.TASK_STORE_MODE;
const products = await load(resolve(root, "app/api/products/route.ts"));
await products.evaluate();
const tasks = await load(resolve(root, "app/api/tasks/route.ts"));
await tasks.evaluate();
const detail = { id: "detail", description: "تقرير جديد", status: "review", completionDate: "2026-10-08", ownerType: "vendor", assignee: "المسؤول" };
const request = (payload) => new Request("https://example.com/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
beforeEach(() => { admin = true; reads = 0; writes = 0; records.clear(); records.set("tasks", [structuredClone(seed)]); });
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
    const productStore = cache.get(resolve(root, "lib/product-store.ts")).namespace;
    const taskStore = cache.get(resolve(root, "lib/task-store.ts")).namespace;
    const product = { id: "local", name: "محلي", target: "", description: "", details: [detail] };
    await productStore.createProductStore().setProducts([product]);
    assert.deepEqual((await productStore.createProductStore().getProducts()).find((p) => p.id === "local"), product);
    await taskStore.createTaskStore().setTasks([seed]);
    assert.deepEqual(await taskStore.createTaskStore().getTasks(), [seed]);
  } finally { delete process.env.TASK_STORE_MODE; }
});
