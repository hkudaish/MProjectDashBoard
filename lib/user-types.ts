export const USER_ROLES = { admin: "مسؤول النظام", editor: "محرر", viewer: "مشاهد" } as const;
export type UserRole = keyof typeof USER_ROLES;
export const POSITIONS = {
  system_admin: "مدير النظام",
  secretary_general: "الأمين العام",
  assistant_secretary_general: "مساعد الأمين العام",
  executive_assistant: "مساعد الأمين العام للشؤون التنفيذية",
  department_manager: "مدير الإدارة",
  project_manager: "مدير المشروع",
  section_head: "رئيس القسم",
  employee: "الموظف",
} as const;
export type Position = keyof typeof POSITIONS;
export const LEADERSHIP_POSITIONS: Position[] = ["secretary_general", "assistant_secretary_general", "executive_assistant"];
export const MANAGER_POSITIONS: Record<Position, Position[]> = {
  system_admin: [],
  secretary_general: [],
  assistant_secretary_general: ["secretary_general"],
  executive_assistant: ["secretary_general"],
  department_manager: LEADERSHIP_POSITIONS,
  project_manager: LEADERSHIP_POSITIONS,
  section_head: ["department_manager"],
  employee: ["section_head"],
};
export type Entity = { id: string; name: string; description: string; hidden: boolean; deleted?: boolean };
export type PublicUser = {
  email: string; loginEmail: string; name: string; role: UserRole; active: boolean;
  position: Position | null; managerEmail: string | null; additionalManagerEmail: string | null; entityId: string | null;
  mustChangePassword: boolean; resetRequestedAt: string | null;
};
export type UserSession = PublicUser & { expiresAt: number; sessionVersion: number };
export type SessionInfo = {
  configured: boolean; authenticated: boolean; isAdmin: boolean;
  canManageUsers: boolean; mustChangePassword: boolean;
  email: string | null; loginEmail: string | null; role: UserRole | null;
  position: Position | null; managerEmail: string | null; additionalManagerEmail: string | null; entityId: string | null; canManageProducts: boolean;
};
