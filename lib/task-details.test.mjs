import assert from "node:assert/strict";
import test from "node:test";
import { taskDetailsSchema } from "./task-details.ts";

const detail = {
  id: "detail-1",
  description: "تنفيذ المهمة التفصيلية",
  status: "in_progress",
  completionDate: "",
  ownerType: "wamy",
  assignee: "أحمد",
};

test("multiple details survive JSON persistence with independent values", () => {
  const details = taskDetailsSchema.parse([
    detail,
    { ...detail, id: "detail-2", description: "المراجعة", status: "completed", completionDate: "2026-10-07", ownerType: "vendor", assignee: "محمد" },
  ]);
  assert.deepEqual(taskDetailsSchema.parse(JSON.parse(JSON.stringify(details))), details);
  assert.equal(details[0].status, "in_progress");
  assert.equal(details[1].status, "completed");
});

test("legacy tasks and removing every detail use an empty list", () => {
  const legacyTask = {};
  assert.deepEqual(taskDetailsSchema.parse(legacyTask.details ?? []), []);
  assert.deepEqual(taskDetailsSchema.parse([]), []);
});

test("rejects invalid details before storage", () => {
  for (const invalid of [
    { ...detail, description: "   " },
    { ...detail, status: "invalid" },
    { ...detail, ownerType: "invalid" },
    { ...detail, completionDate: "2026-02-30" },
    { ...detail, completionDate: "2026-13-01" },
    { ...detail, completionDate: "07/10/2026" },
    { ...detail, assignee: "x".repeat(121) },
  ]) assert.equal(taskDetailsSchema.safeParse([invalid]).success, false);
  assert.equal(taskDetailsSchema.safeParse([detail, detail]).success, false);
  assert.equal(taskDetailsSchema.safeParse(null).success, false);
  assert.equal(taskDetailsSchema.safeParse({}).success, false);
});

test("accepts leap dates and trims description and assignee", () => {
  const [parsed] = taskDetailsSchema.parse([{ ...detail, completionDate: "2028-02-29", description: " وصف ", assignee: " أحمد " }]);
  assert.equal(parsed.description, "وصف");
  assert.equal(parsed.assignee, "أحمد");
});