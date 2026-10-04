import { canAdminLogin, getAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = getAdminSession(request.headers);
  return Response.json(
    {
      configured: canAdminLogin(),
      isAdmin: Boolean(session),
      email: session?.email ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}