import { withActivity } from "@/lib/activity-log";
import { clearedAdminSessionCookie, hasSameOrigin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  if (!hasSameOrigin(request)) {
    return Response.json({ error: "طلب تسجيل الخروج غير صالح." }, { status: 403 });
  }
  return Response.json(
    { isAdmin: false },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearedAdminSessionCookie(),
      },
    },
  );
}
export const POST = withActivity("تسجيل الخروج", handlePOST);
