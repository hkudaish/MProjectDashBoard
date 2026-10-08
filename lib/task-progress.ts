import type { TaskStatus } from "./types";

export const STATUS_PROGRESS = {
  not_started: 0,
  in_progress: 50,
  review: 80,
  completed: 100,
} satisfies Partial<Record<TaskStatus, number>>;

export function progressForStatus(status: TaskStatus, previousProgress = 0): number {
  if (status !== "blocked") return STATUS_PROGRESS[status];
  return Number.isFinite(previousProgress) ? Math.max(0, Math.min(100, Math.round(previousProgress))) : 0;
}