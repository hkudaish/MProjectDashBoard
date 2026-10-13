import type { Task } from "./types";
export const TASK_EDIT_FIELDS = ["status", "progress", "ownerType", "assignee", "notes", "title", "plannedDate", "endDate", "details", "assigneeEmail"] as const;
export type TaskPatch = Partial<Pick<Task, typeof TASK_EDIT_FIELDS[number]>>;
export type TaskUndo = { id: string; title: string; version: string; patch: TaskPatch };
export function taskUndo(previous: Task, next: Task): TaskUndo | null {
  const patch: Record<string, unknown> = {};
  for (const key of TASK_EDIT_FIELDS) {
    const fallback = key === "details" ? [] : "";
    if (JSON.stringify(previous[key] ?? fallback) !== JSON.stringify(next[key] ?? fallback)) patch[key] = structuredClone(previous[key] ?? fallback);
  }
  return Object.keys(patch).length ? { id: next.id, title: previous.title, version: next.updatedAt, patch: patch as TaskPatch } : null;
}
