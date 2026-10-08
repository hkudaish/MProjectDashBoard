import { getStore } from "@netlify/blobs";
import { DEFAULT_PROJECT, projectInputSchema } from "./projects";
import type { Project } from "./types";
const memory = new Map<string, Project>();
export function createProjectStore() {
  const store = process.env.NODE_ENV === "production" && process.env.TASK_STORE_MODE !== "memory" ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null;
  return {
    async getProjects(): Promise<Project[]> {
      const raw = store ? await store.get("projects", { type: "json" }) : [...memory.values()];
      const projects = new Map<string, Project>([[DEFAULT_PROJECT.id, DEFAULT_PROJECT]]);
      if (Array.isArray(raw)) for (const item of raw) {
        const parsed = projectInputSchema.safeParse(item);
        if (parsed.success && typeof item.id === "string" && item.id) projects.set(item.id, { id: item.id, ...parsed.data });
      }
      return [...projects.values()];
    },
    async setProjects(projects: Project[]) {
      if (store) await store.setJSON("projects", projects);
      else { memory.clear(); for (const project of projects) memory.set(project.id, project); }
    },
  };
}
