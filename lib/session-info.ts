import type { SessionInfo, UserSession } from "./user-types";
export function sessionInfo(session: UserSession | null, configured = true): SessionInfo {
  return { configured, authenticated: Boolean(session), email: session?.email ?? null, role: session?.role ?? null,
    mustChangePassword: session?.mustChangePassword ?? false,
    isAdmin: Boolean(session && !session.mustChangePassword && (session.role === "admin" || session.role === "editor")),
    canManageUsers: Boolean(session && !session.mustChangePassword && session.role === "admin") };
}
