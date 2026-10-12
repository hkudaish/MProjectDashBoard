import { getUserSession, hasSameOrigin } from "@/lib/admin-auth";
import { permitted, type Resource, type PermissionAction } from "./permissions";
export function withResourceAccess(resource: Resource, action: PermissionAction | "change", handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
    const actor = await getUserSession(request.headers);
    const allowed = action === "change" ? permitted(actor, resource, "edit") || permitted(actor, resource, "update") : permitted(actor, resource, action);
    if (!allowed) return Response.json({ error: "لا تملك الصلاحية المطلوبة لهذه العملية." }, { status: 403 });
    return handler(request);
  };
}
