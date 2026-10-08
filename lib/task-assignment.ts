import { listUsers } from "./user-accounts";
import { createEntityStore } from "./entity-store";
import { isManager, subordinateUsers } from "./hierarchy";
import type { PublicUser, UserSession } from "./user-types";
import type { Task, TaskDetail, TaskPermissions } from "./types";
export class TaskPolicyError extends Error { constructor(message: string, public status = 403) { super(message); } }
export function taskPermissions(actor: PublicUser, task: Task, users: PublicUser[]): TaskPermissions {
  if (actor.position === "system_admin") return { canEdit: true, canEditMain: true, canUpdateMain: true, canAssign: true, editableDetailIds: (task.details ?? []).map((detail) => detail.id) };
  const managerial = isManager(actor.position);
  const descendants = new Set(subordinateUsers(users, actor.email).filter((user) => user.active).map((user) => user.email));
  const owns = (email?: string) => Boolean(email && (email === actor.email || managerial && descendants.has(email)));
  const canEditMain = managerial && (owns(task.assigneeEmail) || !task.assigneeEmail && task.createdByEmail === actor.email);
  const canUpdateMain = canEditMain || task.assigneeEmail === actor.email;
  const editableDetailIds = (task.details ?? []).filter((detail) => owns(detail.assigneeEmail) || canEditMain && !detail.assigneeEmail).map((detail) => detail.id);
  return { canEdit: canUpdateMain || editableDetailIds.length > 0, canEditMain, canUpdateMain, canAssign: managerial && (canEditMain || editableDetailIds.length > 0), editableDetailIds };
}
function detailFields(detail: TaskDetail) { return { id: detail.id, description: detail.description, status: detail.status, completionDate: detail.completionDate, ownerType: detail.ownerType, assigneeEmail: detail.assigneeEmail ?? "", ...(!detail.assigneeEmail ? { assignee: detail.assignee } : {}) }; }
export async function normalizeTaskAssignments(actor: UserSession, next: Task, previous?: Task): Promise<Task> {
  const users = await listUsers();
  const systemAdmin = actor.position === "system_admin";
  const managerial = isManager(actor.position);
  if (!previous && !managerial) throw new TaskPolicyError("إنشاء المهام متاح للمسؤولين فقط.");
  const permissions = previous ? taskPermissions(actor, previous, users) : { canEdit: true, canEditMain: true, canUpdateMain: true, canAssign: true, editableDetailIds: [] };
  if (!permissions.canEdit) throw new TaskPolicyError("لا تملك صلاحية تعديل هذه المهمة.");
  if (previous && !permissions.canEditMain) {
    const allowed = permissions.canUpdateMain ? new Set(["status", "progress", "notes"]) : new Set<string>();
    for (const key of ["title", "plannedDate", "endDate", "ownerType", "status", "progress", "notes", "assignee", "assigneeEmail"] as const) {
      if (key === "assignee" && next.assigneeEmail && next.assigneeEmail === previous.assigneeEmail) continue;
      if (!allowed.has(key) && (next[key] ?? "") !== (previous[key] ?? "")) throw new TaskPolicyError("صلاحيتك تقتصر على تحديث المهمة المسندة إليك أو الصفوف التابعة لك.");
    }
  }
  const assignable = new Set((systemAdmin ? users : subordinateUsers(users, actor.email)).filter((user) => user.active && user.position).map((user) => user.email));
  const entities = await createEntityStore().getEntities();
  function owner(ownerType: string, previousOwner?: string) {
    if (ownerType === previousOwner || ownerType === "unassigned" || ownerType === "joint") return;
    if (!entities.some((entity) => entity.id === ownerType && !entity.hidden && !entity.deleted)) throw new TaskPolicyError("الجهة المحددة غير متاحة للاختيار.", 400);
  }
  function assignment(item: { assignee: string; assigneeEmail?: string }, old?: { assignee: string; assigneeEmail?: string }) {
    const email = item.assigneeEmail?.trim().toLowerCase() ?? "";
    if (email) {
      const target = users.find((user) => user.email === email);
      if (!target && email === old?.assigneeEmail) return { assigneeEmail: email, assignee: old.assignee };
      if (!target) throw new TaskPolicyError("المستخدم المحدد غير موجود.", 400);
      if (email !== old?.assigneeEmail && (!target.active || !target.position || !assignable.has(email))) throw new TaskPolicyError("يمكن إسناد المهام إلى المستخدمين التابعين لك إداريًا فقط.");
      return { assigneeEmail: email, assignee: target.name };
    }
    if (item.assignee && (!old || old.assigneeEmail || item.assignee !== old.assignee)) throw new TaskPolicyError("اختر المستخدم من قائمة التابعين بدل كتابة اسم حر.", 400);
    return { assignee: item.assignee, ...(item.assigneeEmail !== undefined || old?.assigneeEmail ? { assigneeEmail: "" } : {}) };
  }
  owner(next.ownerType, previous?.ownerType);
  const details: TaskDetail[] = [];
  for (const detail of next.details ?? []) {
    const old = previous?.details?.find((item) => item.id === detail.id);
    if (previous && !systemAdmin) {
      if (!old && !permissions.canEditMain) throw new TaskPolicyError("لا تملك صلاحية إضافة صفوف إلى هذه المهمة.");
      if (old && !permissions.editableDetailIds.includes(old.id) && JSON.stringify(detailFields(detail)) !== JSON.stringify(detailFields(old))) throw new TaskPolicyError("لا يمكنك تعديل صف مسند خارج نطاقك الإداري.");
      if (old && !managerial) for (const key of ["description", "ownerType", "assignee", "assigneeEmail"] as const) {
        if (key === "assignee" && detail.assigneeEmail === old.assigneeEmail && detail.assigneeEmail) continue;
        if ((detail[key] ?? "") !== (old[key] ?? "")) throw new TaskPolicyError("الموظف يستطيع تحديث حالة صفه وتاريخ إنجازه فقط.");
      }
    }
    owner(detail.ownerType, old?.ownerType);
    details.push({ ...detail, ...assignment(detail, old) });
  }
  if (previous && !systemAdmin) for (const old of previous.details ?? []) if (!details.some((detail) => detail.id === old.id) && (!permissions.canEditMain || !permissions.editableDetailIds.includes(old.id))) throw new TaskPolicyError("لا يمكنك حذف هذا الصف التفصيلي.");
  return { ...next, ...assignment(next, previous), ...(next.details !== undefined ? { details } : {}) };
}
export async function normalizeProductDetails(actor: UserSession, details: TaskDetail[], previous?: TaskDetail[]) {
  const task: Task = { id: "product-details", productId: "", productName: "", title: "", plannedDate: "", endDate: "", status: "not_started", progress: 0, ownerType: "unassigned", assignee: "", notes: "", sourceOrder: 0, updatedAt: "", createdByEmail: actor.email, details };
  return (await normalizeTaskAssignments(actor, task, previous ? { ...task, details: previous } : undefined)).details ?? [];
}
