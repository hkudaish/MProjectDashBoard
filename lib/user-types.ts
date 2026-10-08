export const USER_ROLES = { admin: "مسؤول النظام", editor: "محرر", viewer: "مشاهد" } as const;
export type UserRole = keyof typeof USER_ROLES;
export type PublicUser = {
  email: string; name: string; role: UserRole; active: boolean;
  mustChangePassword: boolean; resetRequestedAt: string | null;
};
export type UserSession = PublicUser & { expiresAt: number; sessionVersion: number };
export type SessionInfo = {
  configured: boolean; authenticated: boolean; isAdmin: boolean;
  canManageUsers: boolean; mustChangePassword: boolean;
  email: string | null; role: UserRole | null;
};
