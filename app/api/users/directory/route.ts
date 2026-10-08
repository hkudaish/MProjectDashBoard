import { getUserSession } from "@/lib/admin-auth";
import { listUsers } from "@/lib/user-accounts";
import { isManager, subordinateUsers } from "@/lib/hierarchy";
export async function GET(request: Request) {
  const session = await getUserSession(request.headers);
  if (!session || session.mustChangePassword) return Response.json({ error: "سجّل الدخول وأكمل تغيير كلمة المرور أولًا." }, { status: 401 });
  try {
    const all = await listUsers(); const systemAdmin = session.position === "system_admin";
    const descendants = subordinateUsers(all, session.email);
    const users = systemAdmin ? all : all.filter((user) => user.email === session.email || descendants.some((child) => child.email === user.email));
    const assignableUsers = isManager(session.position) ? (systemAdmin ? all : descendants).filter((user) => user.active && user.position) : [];
    return Response.json({ users, assignableUsers }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "تعذر تحميل المستخدمين التابعين." }, { status: 503 }); }
}
