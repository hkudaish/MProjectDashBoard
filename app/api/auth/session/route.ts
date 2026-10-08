import { canAdminLogin, getUserSession } from "@/lib/admin-auth";
import { sessionInfo } from "@/lib/session-info";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return Response.json(sessionInfo(await getUserSession(request.headers), canAdminLogin()), { headers: { "Cache-Control": "no-store" } });
}
