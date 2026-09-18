import test from "node:test";
import assert from "node:assert/strict";

import { createTaskStore } from "./task-store";

test("creates a working fallback store when Netlify Blob credentials are missing", async () => {
  const store = createTaskStore();
  const tasks = [{
    id: "t-1",
    productId: "digital",
    productName: "المحتوى الرقمي",
    title: "اختبار المهمة",
    plannedDate: "2026-09-20",
    endDate: "2026-09-20",
    ownerType: "wamy",
    assignee: "",
    status: "not_started" as const,
    progress: 0,
    notes: "",
    sourceOrder: 1,
    updatedAt: "2026-09-18T00:00:00.000Z",
  }];

  await store.setTasks(tasks);
  assert.deepEqual(await store.getTasks(), tasks);
});
