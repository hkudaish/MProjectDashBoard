import { getStore } from "@netlify/blobs";
import { getLocalStore } from "./local-store";
import { taskDetailsSchema } from "./task-details";
import { progressForStatus } from "./task-progress";
import { updateRecord } from "./versioned-store";
import type { Task, TaskStatus } from "./types";

const TASKS_KEY = "tasks";
const STORE_NAME = "wamy-task-dashboard";

export type TaskStore = {
  getTasks: () => Promise<Task[]>;
  hasStoredTasks?: () => Promise<boolean>;
  setTasks: (tasks: Task[]) => Promise<void>;
  updateTask?: (task: Task, expectedUpdatedAt: string) => Promise<void>;
};
export class TaskConflictError extends Error { constructor() { super("تغيّرت المهمة بعد آخر قراءة. حدّث البيانات وراجع التغييرات قبل الحفظ أو التراجع."); } }
function replaceTask(tasks: Task[], task: Task, expectedUpdatedAt: string) {
  const index = tasks.findIndex(item => item.id === task.id);
  if (index < 0 || normaliseTask(tasks[index])?.updatedAt !== expectedUpdatedAt) throw new TaskConflictError();
  tasks[index] = task;
}

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
  const updatedAt = typeof task.updatedAt === "string" ? task.updatedAt : "1970-01-01T00:00:00.000Z";
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
    async hasStoredTasks() { return map.has(TASKS_KEY); },
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
    async updateTask(task, expectedUpdatedAt) { const tasks = JSON.parse(map.get(TASKS_KEY) ?? "[]") as Task[]; replaceTask(tasks, task, expectedUpdatedAt); map.set(TASKS_KEY, JSON.stringify(tasks)); },
  };
}

export function createTaskStore(): TaskStore {
  const local = getLocalStore();
  if (!local && (process.env.NODE_ENV !== "production" || process.env.TASK_STORE_MODE === "memory")) {
    return createFallbackStore();
  }

  const store = local ?? getStore(STORE_NAME, { consistency: "strong" });
  return {
    async hasStoredTasks() { return Array.isArray(await store.get(TASKS_KEY, { type: "json" })); },
    async getTasks() {
      const tasks = await store.get(TASKS_KEY, { type: "json" }) as unknown;
      if (!Array.isArray(tasks)) return [];
      return tasks.map(normaliseTask).filter((task): task is Task => Boolean(task));
    },
    async setTasks(tasks: Task[]) {
      await store.setJSON(TASKS_KEY, tasks);
    },
    async updateTask(task, expectedUpdatedAt) { await updateRecord<Task[], void>(TASKS_KEY, [], tasks => replaceTask(tasks, task, expectedUpdatedAt)); },
  };
}
