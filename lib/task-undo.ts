import type { Task } from "./types";
export const TASK_EDIT_FIELDS = ["status", "progress", "ownerType", "assignee", "notes", "title", "plannedDate", "endDate", "details", "assigneeEmail"] as const;
export type TaskPatch = Partial<Pick<Task, typeof TASK_EDIT_FIELDS[number]>>;
export type TaskUndo = { id: string; title: string; version: string; patch: TaskPatch };
const navigationUndo = new Map<string, TaskUndo>();
const UNDO_PREFIX = "mproj-task-undo:";
export function rememberTaskUndo(email: string | null, value: TaskUndo | null) {
  if (typeof window === "undefined" || !email) return;
  if (value) navigationUndo.set(email, structuredClone(value)); else navigationUndo.delete(email);
  try { if (value) window.sessionStorage.setItem(UNDO_PREFIX + email, JSON.stringify(value)); else window.sessionStorage.removeItem(UNDO_PREFIX + email); } catch { /* Retain the in-memory fallback when browser storage is unavailable. */ }
}
export function recallTaskUndo(email: string | null): TaskUndo | null {
  if (typeof window === "undefined" || !email) return null;
  try {
    const raw = window.sessionStorage.getItem(UNDO_PREFIX + email);
    if (raw) { const value = JSON.parse(raw) as TaskUndo; if (typeof value.id === "string" && typeof value.title === "string" && typeof value.version === "string" && value.patch && typeof value.patch === "object" && !Array.isArray(value.patch) && Object.keys(value.patch).every(key => (TASK_EDIT_FIELDS as readonly string[]).includes(key))) return value; }
  } catch { /* Use the session's in-memory snapshot if storage is unavailable. */ }
  const value = navigationUndo.get(email); return value ? structuredClone(value) : null;
}
export function clearTaskUndo() { navigationUndo.clear(); if (typeof window === "undefined") return; try { for (let index = window.sessionStorage.length - 1; index >= 0; index--) { const key = window.sessionStorage.key(index); if (key?.startsWith(UNDO_PREFIX)) window.sessionStorage.removeItem(key); } } catch { /* No browser storage to clear. */ } }
export function taskUndo(previous: Task, next: Task): TaskUndo | null {
  const patch: Record<string, unknown> = {};
  for (const key of TASK_EDIT_FIELDS) {
    const fallback = key === "details" ? [] : "";
    if (JSON.stringify(previous[key] ?? fallback) !== JSON.stringify(next[key] ?? fallback)) patch[key] = structuredClone(previous[key] ?? fallback);
  }
  return Object.keys(patch).length ? { id: next.id, title: previous.title, version: next.updatedAt, patch: patch as TaskPatch } : null;
}
