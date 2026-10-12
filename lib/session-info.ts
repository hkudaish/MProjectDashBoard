import { permissionsFor, permitted } from "./permissions";
import { isManager } from "./hierarchy";
import type { SessionInfo, UserSession } from "./user-types";
export function sessionInfo(session: UserSession | null, configured = true): SessionInfo {
  return { resourcePermissions: session ? permissionsFor(session) : undefined, configured, authenticated: Boolean(session), email: session?.email ?? null, loginEmail: session?.loginEmail ?? null, role: session?.role ?? null, position: session?.position ?? null, managerEmail: session?.managerEmail ?? null, additionalManagerEmail: session?.additionalManagerEmail ?? null, entityId: session?.entityId ?? null,
    canManageProducts: permitted(session, "products", "create"),
    mustChangePassword: session?.mustChangePassword ?? false,
    isAdmin: Boolean(session && !session.mustChangePassword && (session.position === "system_admin" || isManager(session.position))),
    canManageUsers: Boolean(session && !session.mustChangePassword && session.position === "system_admin") };
}
