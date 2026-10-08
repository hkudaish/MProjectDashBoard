export const USER_ROLES = { admin: "مسؤول النظام", editor: "محرر", viewer: "مشاهد" } as const;
export type UserRole = keyof typeof USER_ROLES;
export const POSITIONS = { system_admin: "مدير النظام", project_manager: "مدير المشروع", department_manager: "مدير الإدارة", section_head: "رئيس القسم", employee: "الموظف" } as const;
export type Position = keyof typeof POSITIONS;
export const MANAGER_POSITIONS: Record<Position, Position[]> = {
  system_admin: [], project_manager: ["system_admin"], department_manager: ["system_admin"], section_head: ["department_manager"], employee: ["section_head", "department_manager", "project_manager"],
};
export type Entity = { id: string; name: string; description: string; hidden: boolean; deleted?: boolean };
export type PublicUser = {
  email: string; loginEmail: string; name: string; role: UserRole; active: boolean;
  position: Position | null; managerEmail: string | null; entityId: string | null;
  mustChangePassword: boolean; resetRequestedAt: string | null;
};
export type UserSession = PublicUser & { expiresAt: number; sessionVersion: number };
export type SessionInfo = {
  configured: boolean; authenticated: boolean; isAdmin: boolean;
  canManageUsers: boolean; mustChangePassword: boolean;
  email: string | null; loginEmail: string | null; role: UserRole | null;
  position: Position | null; managerEmail: string | null; entityId: string | null; canManageProducts: boolean;
};
