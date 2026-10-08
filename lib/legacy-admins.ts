import { getStore } from "@netlify/blobs";
export function normalizeAdminEmail(email: string) { return email.trim().toLowerCase(); }
export async function getAllAdminEmails(): Promise<string[]> {
  const configured = (process.env.ADMIN_EMAILS ?? "").split(",").map(normalizeAdminEmail).filter(Boolean);
  const store = process.env.NODE_ENV === "production" && process.env.TASK_STORE_MODE !== "memory" ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null;
  const stored = store ? await store.get("admin-emails", { type: "json" }) as unknown : [];
  return [...new Set([...configured, ...(Array.isArray(stored) ? stored.filter((email): email is string => typeof email === "string").map(normalizeAdminEmail) : [])])];
}
