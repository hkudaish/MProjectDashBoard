export type TaskStatus = "not_started" | "in_progress" | "review" | "completed" | "blocked";

export type TaskDetail = {
  id: string;
  description: string;
  status: TaskStatus;
  completionDate: string;
  ownerType: string;
  assignee: string;
  assigneeEmail?: string;
  ownerName?: string;
};

export type Task = {
  id: string;
  productId: string;
  productName: string;
  title: string;
  details?: TaskDetail[];
  plannedDate: string;
  endDate: string;
  ownerType: string;
  assignee: string;
  assigneeEmail?: string;
  ownerName?: string;
  status: TaskStatus;
  progress: number;
  notes: string;
  sourceOrder: number;
  updatedAt: string;
  createdByEmail?: string;
  permissions?: TaskPermissions;
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "لم يبدأ",
  in_progress: "قيد التنفيذ",
  review: "بانتظار المراجعة",
  completed: "مكتمل",
  blocked: "متعثر",
};

export const OWNER_LABELS: Record<string, string> = {
  wamy: "الندوة العالمية",
  vendor: "الشركة المنفذة",
  joint: "مسؤولية مشتركة",
  unassigned: "غير محدد",
};

export type Product = { id: string; projectId?: string; name: string; target: string; description: string; details?: TaskDetail[] };

export type Project = { id: string; name: string; description: string; entityIds?: string[] };

export type TaskPermissions = { canEdit: boolean; canEditMain: boolean; canUpdateMain: boolean; canAssign: boolean; editableDetailIds: string[] };
