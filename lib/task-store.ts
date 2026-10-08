import { getStore } from "@netlify/blobs";
import { taskDetailsSchema } from "./task-details";
import { progressForStatus } from "./task-progress";
import type { Task, TaskStatus } from "./types";

const TASKS_KEY = "tasks";
const STORE_NAME = "wamy-task-dashboard";

export type TaskStore = {
  getTasks: () => Promise<Task[]>;
  setTasks: (tasks: Task[]) => Promise<void>;
};

const isValidTaskStatus = (value: unknown): value is TaskStatus =>
  value === "not_started" || value === "in_progress" || value === "review" || value === "completed" || value === "blocked";

function normaliseTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== "object") return null;
  const task = raw as Record<string, unknown>;

  const id = typeof task.id === "string" ? task.id : "";
  const productId = typeof task.productId === "string" ? task.productId : "";
  const productName = typeof task.productName === "string" ? task.productName : "";
  const title = typeof task.title === "string" ? task.title : "";
  const plannedDate = typeof task.plannedDate === "string" ? task.plannedDate : "";
  const endDate = typeof task.endDate === "string" ? task.endDate : "";
  const ownerType = typeof task.ownerType === "string" ? task.ownerType : "";
  const assignee = typeof task.assignee === "string" ? task.assignee : "";
  const notes = typeof task.notes === "string" ? task.notes : "";
  const updatedAt = typeof task.updatedAt === "string" ? task.updatedAt : new Date().toISOString();
  const status = isValidTaskStatus(task.status) ? task.status : "not_started";
  const progress = progressForStatus(status, typeof task.progress === "number" ? task.progress : 0);
  const details = taskDetailsSchema.safeParse(task.details);
  const sourceOrder = typeof task.sourceOrder === "number" ? task.sourceOrder : 0;

  if (!id || !productId || !productName || !title || !plannedDate || !endDate) {
    return null;
  }

  return {
    id,
    productId,
    productName,
    title,
    plannedDate,
    endDate,
    ownerType,
    assignee,
    ...(typeof task.assigneeEmail === "string" ? { assigneeEmail: task.assigneeEmail } : {}),
    ...(typeof task.createdByEmail === "string" ? { createdByEmail: task.createdByEmail } : {}),
    status,
    progress,
    notes,
    sourceOrder,
    updatedAt,
    ...(details.success ? { details: details.data } : {}),
  };
}

const map = new Map<string, string>();

function createFallbackStore(): TaskStore {

  return {
    async getTasks() {
      const raw = map.get(TASKS_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normaliseTask).filter((task): task is Task => Boolean(task));
      } catch {
        return [];
      }
    },
    async setTasks(tasks: Task[]) {
      map.set(TASKS_KEY, JSON.stringify(tasks));
    },
  };
}

export function createTaskStore(): TaskStore {
  if (process.env.NODE_ENV !== "production" || process.env.TASK_STORE_MODE === "memory") {
    return createFallbackStore();
  }

  const store = getStore(STORE_NAME, { consistency: "strong" });
  return {
    async getTasks() {
      const tasks = await store.get(TASKS_KEY, { type: "json" }) as unknown;
      if (!Array.isArray(tasks)) return [];
      return tasks.map(normaliseTask).filter((task): task is Task => Boolean(task));
    },
    async setTasks(tasks: Task[]) {
      await store.setJSON(TASKS_KEY, tasks);
    },
  };
}
