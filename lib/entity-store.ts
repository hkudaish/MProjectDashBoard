import { getStore } from "@netlify/blobs";
import { z } from "zod";
import type { Entity } from "./user-types";
export const entityInputSchema = z.object({ name: z.string().trim().min(1, "أدخل اسم الجهة.").max(120), description: z.string().trim().max(1200).default("") });
const schema = entityInputSchema.extend({ id: z.string().min(1), hidden: z.boolean().default(false), deleted: z.boolean().optional() });
const defaults: Entity[] = [{ id: "wamy", name: "الندوة العالمية", description: "", hidden: false }, { id: "vendor", name: "الشركة المنفذة", description: "", hidden: false }];
const memory = new Map<string, Entity>();
export function createEntityStore() {
  const store = process.env.NODE_ENV === "production" && process.env.TASK_STORE_MODE !== "memory" ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null;
  return {
    async getEntities(): Promise<Entity[]> {
      const raw = store ? await store.get("entities", { type: "json" }) : [...memory.values()];
      const entities = new Map(defaults.map((entity) => [entity.id, entity]));
      if (Array.isArray(raw)) for (const item of raw) { const parsed = schema.safeParse(item); if (parsed.success) entities.set(parsed.data.id, parsed.data); }
      return [...entities.values()];
    },
    async setEntities(entities: Entity[]) { if (store) await store.setJSON("entities", entities); else { memory.clear(); for (const entity of entities) memory.set(entity.id, entity); } },
  };
}
export class EntityValidationError extends Error {}
export async function validateEntityIds(ids: string[], previous: string[] = []) {
  const entities = await createEntityStore().getEntities();
  for (const id of ids) if (!entities.some((entity) => entity.id === id && !entity.deleted && (!entity.hidden || previous.includes(id)))) throw new EntityValidationError("الجهة المحددة غير متاحة للاختيار.");
}
