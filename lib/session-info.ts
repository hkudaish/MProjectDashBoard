import { isManager } from "./hierarchy";
import type { SessionInfo, UserSession } from "./user-types";
export function sessionInfo(session: UserSession | null, configured = true): SessionInfo {
  return { configured, authenticated: Boolean(session), email: session?.email ?? null, loginEmail: session?.loginEmail ?? null, role: session?.role ?? null, position: session?.position ?? null, managerEmail: session?.managerEmail ?? null, entityId: session?.entityId ?? null,
    canManageProducts: Boolean(session && !session.mustChangePassword && ["system_admin", "project_manager"].includes(session.position ?? "")),
    mustChangePassword: session?.mustChangePassword ?? false,
    isAdmin: Boolean(session && !session.mustChangePassword && isManager(session.position)),
    canManageUsers: Boolean(session && !session.mustChangePassword && session.position === "system_admin") };
}
