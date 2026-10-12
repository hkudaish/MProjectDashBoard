import { createTaskStore } from "./task-store";
import { createProductStore } from "./product-store";
import { createProjectStore } from "./project-store";
import { createEntityStore } from "./entity-store";
import { findAccount, listUsers } from "./user-accounts";
import { readRecord } from "./versioned-store";
import { POSITIONS } from "./user-types";
import { REGISTRATION_LABELS } from "./registration-types";
import { DEFAULT_TASKS } from "./task-data";

type Data = Record<string, unknown>;
export type ActivityContext = { resource: string; targetId?: string; details: string[]; action?: string };
const sections: Record<string, string> = { tasks: "المهام", products: "المنتجات", projects: "المشاريع", entities: "الجهات", users: "المستخدمون", admins: "المستخدمون", login: "تسجيل الدخول", logout: "تسجيل الخروج", password: "كلمة المرور", "password-reset": "طلب إعادة ضبط كلمة المرور", "registration-requests": "طلبات التسجيل", mailbox: "البريد الإلكتروني", connect: "ربط Google" };
const fields: Record<string, string> = { title: "عنوان المهمة", name: "الاسم", description: "الوصف", status: "حالة الإنجاز", progress: "نسبة الإنجاز", plannedDate: "تاريخ البداية", endDate: "تاريخ النهاية", completionDate: "تاريخ الإنجاز", notes: "ملاحظات التنفيذ", target: "العدد المستهدف", ownerType: "الجهة", assigneeEmail: "المسند إليه", position: "المنصب", managerEmail: "المسؤول المباشر", additionalManagerEmail: "المسؤول الإضافي", entityId: "الجهة", entityIds: "جهات المشروع", projectId: "المشروع", newEmail: "بريد تسجيل الدخول", email: "البريد الإلكتروني", jobTitle: "المسمى الوظيفي", department: "الإدارة", active: "حالة الحساب", hidden: "ظهور الجهة", canMessageLeadership: "مراسلة القيادات", note: "ملاحظة المراجعة" };
const statuses: Record<string, string> = { not_started: "لم يبدأ", in_progress: "قيد التنفيذ", review: "بانتظار المراجعة", completed: "مكتمل", blocked: "متعثر", ...REGISTRATION_LABELS };
const safeText = (value: unknown) => typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").slice(0, 240) : typeof value === "number" ? String(value) : "";
const isData = (value: unknown): value is Data => Boolean(value && typeof value === "object" && !Array.isArray(value));
export async function activityBefore(key: string, input: Data): Promise<Data | undefined> {
  if (typeof input.id !== "string" && typeof input.email !== "string") return;
  if (key === "tasks") { const store = createTaskStore(); const values = await store.getTasks(); return (values.length || await store.hasStoredTasks?.() ? values : DEFAULT_TASKS).find(row => row.id === input.id) as Data | undefined; }
  if (key === "products") return (await createProductStore().getProducts()).find(row => row.id === input.id) as Data | undefined;
  if (key === "projects") return (await createProjectStore().getProjects()).find(row => row.id === input.id) as Data | undefined;
  if (key === "entities") return (await createEntityStore().getEntities()).find(row => row.id === input.id) as Data | undefined;
  if (["users", "admins", "password-reset"].includes(key) && typeof input.email === "string") { const account = await findAccount(input.email); if (account) return { ...account, email: account.loginEmail }; }
  if (key === "registration-requests") return (await readRecord<Data[]>("registration-requests-v1", [])).find(row => row.id === input.id);
}
export async function describeActivity(key: string, method: string, input: Data, previous: Data | undefined, response: Data): Promise<ActivityContext> {
  const saved = ["task", "product", "project", "entity", "user", "request"].map(field => response[field]).find(isData);
  const target = saved ?? previous ?? input;
  const id = safeText(target.id || target.email || input.id || input.email);
  const title = safeText(target.title || target.name || target.loginEmail || target.email || input.email);
  const resource = `${sections[key] || key}${title ? `: ${title}` : ""}`;
  const details: string[] = [];
  const names = new Map<string, string>();
  if (Object.keys(input).some(field => ["ownerType", "entityId", "entityIds", "assigneeEmail", "managerEmail", "additionalManagerEmail", "projectId", "details"].includes(field))) {
    const [entities, users, projects] = await Promise.all([createEntityStore().getEntities(), listUsers(), createProjectStore().getProjects()]);
    entities.forEach(row => names.set(row.id, row.name)); users.forEach(row => names.set(row.email, `${row.name} (${row.position ? POSITIONS[row.position] : "منصب غير محدد"})`)); projects.forEach(row => names.set(row.id, row.name));
  }
  const display = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "غير محدد";
    if (field === "position" && typeof value === "string") return POSITIONS[value as keyof typeof POSITIONS] || safeText(value);
    if (field === "status" && typeof value === "string") return statuses[value] || safeText(value);
    if (field === "active") return value ? "نشط" : "معطل";
    if (field === "hidden") return value ? "محجوبة" : "ظاهرة";
    if (typeof value === "boolean") return value ? "مسموح" : "غير مسموح";
    if (field === "progress") return `${safeText(value)}%`;
    if (Array.isArray(value)) return value.map(item => names.get(String(item)) || safeText(item)).join("، ").slice(0, 500) || "بدون جهات";
    return names.get(String(value)) || safeText(value);
  };
  function changes(data: Data, old: Data | undefined, next: Data, prefix = "") {
    for (const field of Object.keys(fields)) {
      if (!(field in data)) continue;
      const oldField = field === "newEmail" ? "loginEmail" : field;
      const value = field === "newEmail" ? next.loginEmail ?? data[field] : next[field] ?? data[field];
      if (old && JSON.stringify(old[oldField] ?? null) === JSON.stringify(value ?? null)) continue;
      const label = key === "registration-requests" && field === "status" ? "قرار المراجعة" : fields[field];
      details.push(`${prefix}${label}: ${old && method === "PATCH" ? `${display(field, old[oldField])} ← ` : ""}${display(field, value)}`);
    }
  }
  if (method !== "DELETE") changes(input, previous, saved ?? input);
  if (Array.isArray(input.details)) {
    const before = Array.isArray(previous?.details) ? previous.details.filter(isData) : [];
    const after = Array.isArray(saved?.details) ? saved.details.filter(isData) : input.details.filter(isData);
    for (const row of after) { const old = before.find(item => item.id === row.id); const label = safeText(row.description || row.title) || "صف تفصيلي"; if (!old) details.push(`إضافة تفصيل: ${label}`); changes(row, old, row, `تفصيل «${label}» — `); }
    for (const row of before.filter(row => !after.some(item => item.id === row.id))) details.push(`حذف تفصيل: ${safeText(row.description || row.title) || safeText(row.id)}`);
  }
  // Never retain passwords, hashes, OAuth secrets or message bodies in the audit trail.
  if (typeof input.temporaryPassword === "string") details.push("تعيين كلمة مرور مؤقتة وإلزام المستخدم بتغييرها عند الدخول");
  if (key === "password") details.push("تغيير كلمة مرور الحساب؛ لا تُحفظ كلمة المرور في السجل");
  if (method === "DELETE") details.push(`حذف السجل: ${title || id || sections[key] || key}`);
  if (key === "mailbox") details.push(`الرد على الرسالة البريدية رقم ${safeText(input.id)}`);
  let action: string | undefined;
  const singular: Record<string, string> = { tasks: "مهمة", products: "منتج", projects: "مشروع", entities: "جهة", users: "مستخدم", admins: "مستخدم", "registration-requests": "طلب تسجيل" };
  if (singular[key]) action = method === "POST" ? `إضافة ${singular[key]}` : method === "DELETE" ? `حذف ${singular[key]}` : method === "PATCH" ? `تعديل بيانات ${singular[key]}` : undefined;
  if (key === "tasks" && method === "PATCH" && !["title", "plannedDate", "endDate", "ownerType", "assigneeEmail"].some(field => field in input) && ["status", "progress", "notes"].some(field => field in input)) action = "تحديث إنجاز المهمة";
  if (key === "users" && method === "PATCH") action = typeof input.temporaryPassword === "string" ? "إعادة ضبط كلمة مرور المستخدم" : typeof input.active === "boolean" ? input.active ? "تفعيل حساب المستخدم" : "تعطيل حساب المستخدم" : "تعديل بيانات المستخدم";
  if (key === "entities" && method === "PATCH" && typeof input.hidden === "boolean") action = input.hidden ? "حجب جهة" : "إظهار جهة";
  if (key === "registration-requests" && method === "PATCH" && typeof input.status === "string") action = `مراجعة طلب تسجيل — ${statuses[input.status] || safeText(input.status)}`;
  if (key === "mailbox") action = "إرسال رد بالبريد الإلكتروني";
  return { resource, ...(id ? { targetId: id } : {}), details: details.slice(0, 100), ...(action ? { action } : {}) };
}
