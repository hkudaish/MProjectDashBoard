import { randomUUID } from "node:crypto";
import { getUserSession } from "@/lib/admin-auth";
import { readRecord, updateRecord } from "./versioned-store";
export type ActivityEntry = { id: string; action: string; resource: string; actorEmail: string; actorName: string; createdAt: string };
const KEY = "activity-log-v1";
export async function recordActivity(actor: { email: string; name: string }, action: string, resource: string) {
  const entry: ActivityEntry = { id: randomUUID(), action, resource, actorEmail: actor.email, actorName: actor.name, createdAt: new Date().toISOString() };
  await updateRecord<ActivityEntry[], void>(KEY, [], entries => { entries.push(entry); });
}
export async function listActivity(email: string, administrator: boolean) { return (await readRecord<ActivityEntry[]>(KEY, [])).filter(entry => administrator || entry.actorEmail === email).reverse(); }
export async function deleteActivity(id?: string) { await updateRecord<ActivityEntry[], void>(KEY, [], entries => { const remaining = id ? entries.filter(entry => entry.id !== id) : []; entries.splice(0, entries.length, ...remaining); }); }
const resources: Record<string, string> = { tasks: "المهام", products: "المنتجات", projects: "المشاريع", entities: "الجهات", users: "المستخدمون", admins: "المستخدمون", login: "تسجيل الدخول", logout: "تسجيل الخروج", password: "كلمة المرور", "password-reset": "طلب إعادة ضبط كلمة المرور", "registration-requests": "طلبات التسجيل", mailbox: "البريد الإلكتروني", connect: "ربط Google" };
export function withActivity(action: string, handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const before = await getUserSession(request.headers);
    const key = new URL(request.url).pathname.split("/").at(-1) || "";
    const publicInput = !before && ["registration-requests", "password-reset"].includes(key) ? await request.clone().json().catch(() => null) as { email?: unknown; name?: unknown } | null : null;
    const response = await handler(request);
    if (!response.ok) return response;
    let actor = before;
    const cookie = response.headers.get("set-cookie");
    if (cookie && (!actor || key === "login")) actor = await getUserSession(new Headers({ cookie: cookie.split(";")[0] }));
    if (actor) {
      await recordActivity(actor, action, resources[key] || key);
    } else if (typeof publicInput?.email === "string") await recordActivity({ email: publicInput.email.slice(0, 254), name: `${typeof publicInput.name === "string" ? publicInput.name.slice(0, 120) : "زائر"} — هوية غير موثّقة` }, action, resources[key] || key);
    return response;
  };
}
