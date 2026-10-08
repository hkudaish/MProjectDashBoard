import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { taskDetailsSchema } from "../lib/task-details.ts";
import { progressForStatus } from "../lib/task-progress.ts";

const legacyTask = {
  id: "task-1", productId: "digital", productName: "المحتوى الرقمي",
  title: "المهمة الرئيسية", plannedDate: "2026-08-27", endDate: "2026-08-27",
  ownerType: "wamy", assignee: "", status: "not_started", progress: 0,
  notes: "ملاحظات موجودة", sourceOrder: 1, updatedAt: "2026-08-27T00:00:00.000Z",
};
const details = [
  { id: "detail-1", description: "تنفيذ", status: "in_progress", completionDate: "", ownerType: "wamy", assignee: "أحمد" },
  { id: "detail-2", description: "مراجعة", status: "completed", completionDate: "2026-10-07", ownerType: "vendor", assignee: "محمد" },
];
let isAdmin;
let persisted;
let writes;
let reads;
const store = {
  async get() { reads++; return structuredClone(persisted); },
  async setJSON(key, value) { assert.equal(key, "tasks"); writes++; persisted = structuredClone(value); },
};
process.env.NODE_ENV = "production";
delete process.env.TASK_STORE_MODE;
const productsModule = new vm.SourceTextModule(ts.transpileModule(readFileSync(new URL("../lib/products.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText);
await productsModule.link((specifier) => {
  const values = specifier === "zod" ? { z: createRequire(import.meta.url)("zod").z } : { taskDetailsSchema };
  return new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  });
});
await productsModule.evaluate();
const imports = {
  "@/lib/products": { taskTitleSchema: productsModule.namespace.taskTitleSchema, taskInputSchema: productsModule.namespace.taskInputSchema },
  "@/lib/product-store": { createProductStore: () => ({ getProducts: async () => productsModule.namespace.DEFAULT_PRODUCTS }) },
  "@netlify/blobs": { getStore: () => store },
  "@/lib/admin-auth": { getAdminSession: async () => isAdmin ? { email: "admin@example.com" } : null },
  "@/lib/task-data": { DEFAULT_TASKS: [legacyTask] },
  "@/lib/task-details": { taskDetailsSchema },
  "@/lib/task-progress": { progressForStatus },
};
const storeSource = ts.transpileModule(readFileSync(new URL("../lib/task-store.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const storeModule = new vm.SourceTextModule(storeSource);
await storeModule.link((specifier) => {
  const values = specifier === "./task-details" ? { taskDetailsSchema } : specifier === "./task-progress" ? { progressForStatus } : imports[specifier];
  assert.ok(values);
  return new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  });
});
await storeModule.evaluate();
imports["@/lib/task-store"] = { createTaskStore: storeModule.namespace.createTaskStore };
const source = ts.transpileModule(readFileSync(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const route = new vm.SourceTextModule(source);
await route.link((specifier) => {
  const exports = imports[specifier];
  assert.ok(exports, `Unexpected dependency ${specifier}`);
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  });
});
await route.evaluate();
const { GET, PATCH, POST } = route.namespace;
function patch(payload) {
  return PATCH(new Request("https://example.com/api/tasks", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "task-1", ...payload }),
  }));
}
beforeEach(() => {
  isAdmin = true;
  persisted = [structuredClone(legacyTask)];
  writes = 0;
  reads = 0;
});

test("admin saves multiple details and GET returns them without changing parent fields", async () => {
  const response = await patch({ details });
  assert.equal(response.status, 200);
  const updated = (await response.json()).task;
  assert.deepEqual(updated.details, details);
  for (const [key, value] of Object.entries(legacyTask)) {
    if (key !== "updatedAt") assert.equal(updated[key], value);
  }
  assert.deepEqual((await (await GET()).json()).tasks[0].details, details);
  assert.equal(writes, 1);
});

test("ordinary status edits preserve saved details", async () => {
  persisted[0].details = structuredClone(details);
  assert.equal((await patch({ status: "review" })).status, 200);
  assert.deepEqual(persisted[0].details, details);
});

test("admin can remove every detail", async () => {
  persisted[0].details = structuredClone(details);
  assert.equal((await patch({ details: [] })).status, 200);
  assert.deepEqual(persisted[0].details, []);
});

test("non-admin cannot write details or access the store through PATCH", async () => {
  isAdmin = false;
  assert.equal((await patch({ details })).status, 401);
  assert.equal(writes, 0);
  assert.equal(reads, 0);
});

test("invalid details leave stored task unchanged", async () => {
  assert.equal((await patch({ details: [{ ...details[0], completionDate: "2026-02-30" }] })).status, 400);
  assert.equal(writes, 0);
  assert.deepEqual(persisted, [legacyTask]);
});

test("status transitions set the agreed percentages even when progress is stale", async () => {
  for (const [status, expected] of [["in_progress", 50], ["review", 80], ["completed", 100], ["not_started", 0]]) {
    const response = await patch({ status, progress: 17 });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).task.progress, expected);
    assert.equal(persisted[0].progress, expected);
  }
});

test("GET recalculates existing progress for all four products without writing storage", async () => {
  persisted = ["digital", "infographic", "film", "report"].map((productId, index) => ({
    ...legacyTask, id: `task-${index}`, productId, status: index % 2 ? "review" : "in_progress", progress: 10, details,
  }));
  const response = await GET();
  assert.equal(response.status, 200);
  const tasks = (await response.json()).tasks;
  assert.equal(tasks.length, 4);
  for (const task of tasks) {
    assert.equal(task.progress, task.status === "review" ? 80 : 50);
    assert.deepEqual(task.details, details);
  }
  assert.equal(writes, 0);
  assert.equal(persisted[0].progress, 10);
});

test("blocked tasks keep their last progress and unrelated edits keep the correct percentage", async () => {
  await patch({ status: "review" });
  assert.equal((await (await patch({ status: "blocked" })).json()).task.progress, 80);
  assert.equal((await (await patch({ assignee: "Updated owner" })).json()).task.progress, 80);
  assert.equal((await (await patch({ progress: 65 })).json()).task.progress, 65);
  await patch({ status: "in_progress" });
  assert.equal((await (await patch({ notes: "Update only notes", progress: 99 })).json()).task.progress, 50);
});

function createTask(payload) {
  return POST(new Request("https://example.com/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
}
test("non-admin cannot create tasks", async () => {
  isAdmin = false;
  assert.equal((await createTask(legacyTask)).status, 401);
  assert.equal(reads, 0); assert.equal(writes, 0);
});
test("create supports every existing product and persists details without changing existing tasks", async () => {
  for (const product of productsModule.namespace.DEFAULT_PRODUCTS) {
    const response = await createTask({ ...legacyTask, productId: product.id, productName: "forged", id: "forged", status: "review", progress: 15, details });
    assert.equal(response.status, 201);
    const task = (await response.json()).task;
    assert.notEqual(task.id, "forged"); assert.equal(task.productName, product.name);
    assert.equal(task.progress, 80); assert.deepEqual(task.details, details);
    assert.deepEqual((await (await GET()).json()).tasks.find((t) => t.id === task.id).details, details);
  }
  assert.deepEqual(persisted[0], legacyTask);
  assert.equal(new Set(persisted.map((t) => t.id)).size, 5);
});
test("invalid creation rejects unknown products, blank titles, invalid dates and reversed ranges", async () => {
  for (const change of [{ productId: "missing" }, { title: "  " }, { plannedDate: "2026-02-30" }, { endDate: "2026-08-26" }, { details: [{ ...details[0], description: "" }] }]) {
    assert.equal((await createTask({ ...legacyTask, ...change })).status, 400);
    assert.equal(writes, 0);
  }
});
