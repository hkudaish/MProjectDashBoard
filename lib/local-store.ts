import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

type RecordValue = { data: unknown; etag: string };

// An isolated disk store for local development; never connects to production.
export function getLocalStore() {
  const directory = process.env.LOCAL_DATA_DIR;
  if (!directory || process.env.TASK_STORE_MODE === "memory") return null;
  const root = resolve(directory);
  mkdirSync(root, { recursive: true });
  const pathFor = (key: string) => {
    if (!/^[a-z0-9-]+$/i.test(key)) throw new Error("Invalid local storage key");
    return join(root, `${key}.json`);
  };
  const read = (key: string): RecordValue | null => {
    try { return JSON.parse(readFileSync(pathFor(key), "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  return {
    async get(key: string, options?: { type: "json" }) { void options; return read(key)?.data ?? null; },
    async getWithMetadata(key: string, options?: { type: "json" }) { void options; return read(key); },
    async setJSON(key: string, data: unknown, conditions?: { onlyIfMatch?: string; onlyIfNew?: boolean }) {
      const file = pathFor(key);
      const lock = `${file}.lock`;
      let descriptor: number;
      try { descriptor = openSync(lock, "wx"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST" && conditions) return { modified: false };
        throw error;
      }
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        const current = read(key);
        if ((conditions?.onlyIfNew && current) || (conditions?.onlyIfMatch && current?.etag !== conditions.onlyIfMatch)) return { modified: false };
        writeFileSync(temporary, JSON.stringify({ data, etag: randomUUID() }), { mode: 0o600 });
        renameSync(temporary, file);
        return { modified: true };
      } finally {
        closeSync(descriptor);
        unlinkSync(lock);
      }
    },
  };
}
