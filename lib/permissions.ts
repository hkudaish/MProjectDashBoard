import { z } from "zod";
export const RESOURCE_LABELS = { projects: "المشاريع", products: "المنتجات", tasks: "المهام" } as const;
export const ACTION_LABELS = { create: "إضافة", view: "اطلاع", edit: "تعديل", update: "تحديث", delete: "حذف" } as const;
export type Resource = keyof typeof RESOURCE_LABELS;
export type PermissionAction = keyof typeof ACTION_LABELS;
const actions = z.object({ create: z.boolean(), view: z.boolean(), edit: z.boolean(), update: z.boolean(), delete: z.boolean() }).strict();
export const permissionsSchema = z.object({ projects: actions, products: actions, tasks: actions }).strict();
export type ResourcePermissions = z.infer<typeof permissionsSchema>;
type Subject = { position?: string | null; active?: boolean; mustChangePassword?: boolean; resourcePermissions?: ResourcePermissions | null };
export function permissionsFor(user: Subject): ResourcePermissions {
  const all = { create: true, view: true, edit: true, update: true, delete: true };
  if (user.position === "system_admin") return { projects: { ...all }, products: { ...all }, tasks: { ...all } };
  if (user.resourcePermissions) return structuredClone(user.resourcePermissions);
  const read = { create: false, view: true, edit: false, update: false, delete: false };
  const manager = Boolean(user.position && !["employee", "system_admin"].includes(user.position));
  return { projects: { ...read }, products: { ...read }, tasks: { create: manager, view: true, edit: manager, update: true, delete: false } };
}
export function permitted(user: Subject | null | undefined, resource: Resource, action: PermissionAction) { return Boolean(user && user.active !== false && !user.mustChangePassword && permissionsFor(user)[resource].view && permissionsFor(user)[resource][action]); }
export class PermissionError extends Error { constructor() { super("لا تملك الصلاحية المطلوبة لهذه العملية."); } }
export function requirePermission(user: Subject, resource: Resource, action: PermissionAction) { if (!permitted(user, resource, action)) throw new PermissionError(); }
function structure(details: unknown) { return Array.isArray(details) ? details.map(item => { const { status, completionDate, ownerName, ...rest } = item as Record<string, unknown>; void status; void completionDate; void ownerName; if (rest.assigneeEmail) delete rest.assignee; return rest; }) : []; }
export function requireChanges(user: Subject, resource: Resource, previous: Record<string, unknown>, next: Record<string, unknown>) {
  const keys = resource === "projects" ? ["name", "description"] : resource === "products" ? ["name", "target", "description"] : ["title", "plannedDate", "endDate", "ownerType", "assigneeEmail"];
  const different = (key: string) => JSON.stringify(previous[key] ?? (["details", "entityIds"].includes(key) ? [] : "")) !== JSON.stringify(next[key] ?? (["details", "entityIds"].includes(key) ? [] : ""));
  const content = keys.some(different) || resource !== "projects" && JSON.stringify(structure(previous.details)) !== JSON.stringify(structure(next.details));
  const updates = (resource === "projects" ? ["entityIds"] : resource === "tasks" ? ["status", "progress", "notes", "details"] : ["details"]).some(different);
  if (content) requirePermission(user, resource, "edit");
  if (updates && !content) requirePermission(user, resource, "update");
  if (content && resource === "tasks" && ["status", "progress", "notes"].some(different)) requirePermission(user, resource, "update");
  if (content && resource === "projects" && different("entityIds")) requirePermission(user, resource, "update");
  if (resource !== "projects" && Array.isArray(previous.details) && Array.isArray(next.details) && next.details.some(item => { const old = (previous.details as Record<string, unknown>[]).find(row => row.id === item.id); return old && (old.status !== item.status || old.completionDate !== item.completionDate); })) requirePermission(user, resource, "update");
}
