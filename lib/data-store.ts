import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { getLocalStore } from "./local-store";

export type DataStore = {
  get(key: string, options?: { type: "json" }): Promise<unknown>;
  getWithMetadata(key: string, options?: { type: "json" }): Promise<{ data: unknown; etag?: string } | null>;
  setJSON(key: string, data: unknown, conditions?: { onlyIfMatch?: string; onlyIfNew?: boolean }): Promise<{ modified: boolean }>;
};
type State = { namespace: string; revision: number; lock?: { id: string; expires: number } };
const STATE = "backup-state-v1";
export function getRawDataStore(): DataStore | null {
  if (process.env.TASK_STORE_MODE === "memory") return null;
  return getLocalStore() ?? (process.env.NODE_ENV === "production" ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null);
}
async function readState(store: DataStore) {
  const row = await store.getWithMetadata(STATE, { type: "json" });
  return { state: (row?.data ?? { namespace: "", revision: 0 }) as State, etag: row?.etag };
}
export const dataKey = (namespace: string, key: string) => namespace ? `${namespace}-${key}` : key;
export async function withDataLock<T>(store: DataStore, action: (state: State, commit: (namespace: string) => void) => Promise<T>): Promise<T> {
  const id = randomUUID();
  for (let attempt = 0; attempt < 80; attempt++) {
    const current = await readState(store);
    if (current.state.lock && current.state.lock.expires > Date.now()) {
      await new Promise(resolve => setTimeout(resolve, 50)); continue;
    }
    const locked = { ...current.state, lock: { id, expires: Date.now() + 120_000 } };
    if (!(await store.setJSON(STATE, locked, current.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true })).modified) continue;
    let namespace = current.state.namespace;
    try {
      return await action(current.state, next => { namespace = next; });
    } finally {
      const owner = await readState(store);
      if (owner.state.lock?.id !== id || !owner.etag) throw new Error("انتهت مهلة العملية. أعد تحميل الصفحة وتحقق من حالة البيانات.");
      const result = await store.setJSON(STATE, { namespace, revision: current.state.revision + 1 }, { onlyIfMatch: owner.etag });
      if (!result.modified) throw new Error("تعذر تثبيت حالة البيانات. أعد تحميل الصفحة.");
    }
  }
  throw new Error("البيانات مشغولة بعملية أخرى. حاول مجددًا بعد لحظات.");
}
export function getDataStore(): DataStore | null {
  const base = getRawDataStore();
  if (!base) return null;
  // Pin each store instance to a generation. A write started before a restore
  // must never overwrite records in the newly restored generation.
  let namespace: Promise<string> | undefined;
  const pinned = () => namespace ??= readState(base).then(value => value.state.namespace);
  return {
    async get(key, options) { return base.get(dataKey(await pinned(), key), options); },
    async getWithMetadata(key, options) { return base.getWithMetadata(dataKey(await pinned(), key), options); },
    async setJSON(key, data, conditions) {
      const expected = await pinned();
      return withDataLock(base, async state => {
        if (state.namespace !== expected) {
          if (conditions) return { modified: false };
          throw new Error("استُعيدت البيانات أثناء التعديل. أعد تحميل الصفحة وحاول مجددًا.");
        }
        return base.setJSON(dataKey(expected, key), data, conditions);
      });
    },
  };
}
