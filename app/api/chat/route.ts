import { getUserSession, hasSameOrigin } from "@/lib/admin-auth";
import { chatActionSchema, chatSendSchema, chatOverview, chatConversation, readChat, sendChat, changeChat, inspectChats, sentBroadcasts, ChatError } from "@/lib/chat";
import { z } from "zod";
export const dynamic = "force-dynamic";
async function session(request: Request) { const actor = await getUserSession(request.headers); return actor && !actor.mustChangePassword ? actor : null; }
function failure(error: unknown) { return Response.json({ error: error instanceof ChatError ? error.message : "تعذر تنفيذ العملية." }, { status: error instanceof ChatError ? error.status : 503 }); }
export async function GET(request: Request) {
  const actor = await session(request); if (!actor) return Response.json({ error: "سجّل الدخول وغيّر كلمة المرور المؤقتة أولًا." }, { status: 403 });
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("supervise") === "1") return Response.json({ messages: await inspectChats(actor) }, { headers: { "Cache-Control": "no-store" } });
    if (url.searchParams.get("broadcast") === "1") return Response.json({ ...await chatOverview(actor), messages: await sentBroadcasts(actor) }, { headers: { "Cache-Control": "no-store" } });
    const peer = url.searchParams.get("peer");
    if (peer && !z.string().email().max(254).safeParse(peer).success) return Response.json({ error: "المستخدم غير صالح." }, { status: 400 });
    return Response.json({ ...await chatOverview(actor), ...(peer ? { messages: await chatConversation(actor, peer) } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const actor = await session(request); if (!actor) return Response.json({ error: "المراسلة تتطلب تسجيل الدخول." }, { status: 403 });
  const parsed = chatSendSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "اختر المستلم واكتب رسالة لا تتجاوز 4000 حرف." }, { status: 400 });
  try { return Response.json({ message: await sendChat(actor, parsed.data) }, { status: 201 }); } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const actor = await session(request); if (!actor) return Response.json({ error: "سجّل الدخول أولًا." }, { status: 403 });
  const parsed = chatActionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "بيانات العملية غير صالحة." }, { status: 400 });
  try { await changeChat(actor, parsed.data); return Response.json({ ok: true }); } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const actor = await session(request); if (!actor) return Response.json({ error: "سجّل الدخول أولًا." }, { status: 403 });
  const parsed = z.object({ peer: z.string().email().max(254) }).strict().safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "اختر المحادثة." }, { status: 400 });
  try { await readChat(actor, parsed.data.peer); return Response.json({ ok: true }); } catch (error) { return failure(error); }
}
