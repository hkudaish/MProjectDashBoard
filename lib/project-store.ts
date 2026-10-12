import { getStore } from "@netlify/blobs";
import { getLocalStore } from "./local-store";
import { DEFAULT_PROJECT, projectInputSchema } from "./projects";
import type { Project } from "./types";
const memory = new Map<string, Project>();
export function createProjectStore() {
  const store = getLocalStore() ?? (process.env.NODE_ENV === "production" && process.env.TASK_STORE_MODE !== "memory" ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null);
  return {
    async getProjects(): Promise<Project[]> {
      const raw = store ? await store.get("projects", { type: "json" }) : [...memory.values()];
      const projects = new Map<string, Project>([[DEFAULT_PROJECT.id, DEFAULT_PROJECT]]);
      if (Array.isArray(raw)) for (const item of raw) {
        if (typeof item.id === "string" && item.deleted === true) { projects.delete(item.id); continue; }
        const parsed = projectInputSchema.safeParse(item);
        if (parsed.success && typeof item.id === "string" && item.id) projects.set(item.id, { id: item.id, ...parsed.data });
      }
      return [...projects.values()];
    },
    async setProjects(projects: Project[]) {
      const previous = store ? await store.get("projects", { type: "json" }) : [...memory.values()];
      const tombstones = Array.isArray(previous) ? previous.filter(item => item.deleted === true && !projects.some(value => value.id === item.id)) : [];
      const next = [...tombstones, ...projects];
      if (store) await store.setJSON("projects", next); else { memory.clear(); for (const item of next) memory.set(item.id, item); }
    },
  };
}
