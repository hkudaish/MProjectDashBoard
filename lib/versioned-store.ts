import { getStore } from "@netlify/blobs";
import { getLocalStore } from "./local-store";
import { randomUUID } from "node:crypto";
const memory = new Map<string, { data: unknown; etag: string }>();
function storage() { return getLocalStore() ?? (process.env.NODE_ENV === "production" && process.env.TASK_STORE_MODE !== "memory" ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null); }
export async function readRecord<T>(key: string, fallback: T): Promise<T> { const store = storage(); return (store ? await store.get(key, { type: "json" }) : memory.get(key)?.data) as T ?? fallback; }
export async function updateRecord<T, R>(key: string, fallback: T, action: (data: T) => R): Promise<R> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const store = storage();
    const current = store ? await store.getWithMetadata(key, { type: "json" }) : memory.get(key);
    const next = structuredClone((current?.data ?? fallback) as T);
    const result = action(next);
    if (store) { if ((await store.setJSON(key, next, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true })).modified) return result; }
    else if (memory.get(key)?.etag === current?.etag) { memory.set(key, { data: next, etag: randomUUID() }); return result; }
  }
  throw new Error("حدث تعديل متزامن. حاول مرة أخرى.");
}
