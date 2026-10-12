import { randomUUID } from "node:crypto";
import { z } from "zod";
import { listUsers } from "./user-accounts";
import { readRecord, updateRecord } from "./versioned-store";
import { recordActivity } from "./activity-log";
import type { UserSession } from "./user-types";
import type { ChatMessage } from "./chat-types";
const KEY = "chat-messages-v1";
export const chatSendSchema = z.object({ recipient: z.string().email().max(254), text: z.string().trim().min(1).max(4000) }).strict();
export const chatActionSchema = z.object({ id: z.string().uuid(), action: z.enum(["edit", "recall", "delete", "remove"]), text: z.string().trim().min(1).max(4000).optional() }).strict();
export class ChatError extends Error { constructor(message: string, public status = 400) { super(message); } }
function visible(message: ChatMessage, email: string) { return (message.sender === email || message.recipient === email) && !message.deletedFor.includes(email); }
export async function chatOverview(actor: UserSession) {
  const [users, messages] = await Promise.all([listUsers(), readRecord<ChatMessage[]>(KEY, [])]);
  const unread = messages.filter(m => m.recipient === actor.email && !m.readAt && !m.recalledAt && !m.removedAt && !m.deletedFor.includes(actor.email));
  return { unread: unread.length, contacts: users.filter(u => u.active && u.email !== actor.email).map(u => ({ email: u.email, name: u.name, position: u.position, unread: unread.filter(m => m.sender === u.email).length })) };
}
export async function chatConversation(actor: UserSession, peer: string) { return (await readRecord<ChatMessage[]>(KEY, [])).filter(m => visible(m, actor.email) && (m.sender === peer || m.recipient === peer)); }
export async function readChat(actor: UserSession, peer: string) {
  await updateRecord<ChatMessage[], void>(KEY, [], messages => { for (const m of messages) if (m.sender === peer && m.recipient === actor.email && !m.readAt && !m.deletedFor.includes(actor.email)) m.readAt = new Date().toISOString(); });
}
export async function sendChat(actor: UserSession, input: z.infer<typeof chatSendSchema>) {
  const parsed = chatSendSchema.parse(input);
  if (parsed.recipient === actor.email || !(await listUsers()).some(u => u.active && u.email === parsed.recipient)) throw new ChatError("اختر مستخدمًا نشطًا آخر.");
  const message: ChatMessage = { id: randomUUID(), sender: actor.email, recipient: parsed.recipient, text: parsed.text, createdAt: new Date().toISOString(), editedAt: null, readAt: null, recalledAt: null, removedAt: null, deletedFor: [] };
  await updateRecord<ChatMessage[], void>(KEY, [], messages => { messages.push(message); });
  await recordActivity(actor, "إرسال رسالة", "المحادثات"); return message;
}
export async function changeChat(actor: UserSession, input: z.infer<typeof chatActionSchema>) {
  const parsed = chatActionSchema.parse(input);
  if (parsed.action === "remove" && actor.position !== "system_admin") throw new ChatError("الحذف للجميع متاح لمدير النظام فقط.", 403);
  await updateRecord<ChatMessage[], void>(KEY, [], messages => {
    const message = messages.find(m => m.id === parsed.id);
    if (!message || (parsed.action !== "remove" && !visible(message, actor.email))) throw new ChatError("الرسالة غير متاحة.", 404);
    if (parsed.action === "remove") { if (actor.position !== "system_admin") throw new ChatError("الحذف للجميع متاح لمدير النظام فقط.", 403); message.text = ""; message.removedAt = new Date().toISOString(); return; }
    if (parsed.action === "delete") { if (!message.deletedFor.includes(actor.email)) message.deletedFor.push(actor.email); return; }
    if (message.sender !== actor.email) throw new ChatError("يمكنك تعديل رسائلك فقط.", 403);
    if (message.recalledAt || message.removedAt || Date.now() - Date.parse(message.createdAt) >= 60000) throw new ChatError("انتهت مهلة الدقيقة أو لم تعد الرسالة متاحة.");
    if (parsed.action === "edit") { if (!parsed.text) throw new ChatError("اكتب نص الرسالة."); message.text = parsed.text; message.editedAt = new Date().toISOString(); }
    else { message.text = ""; message.recalledAt = new Date().toISOString(); }
  });
  const names = { edit: "تعديل رسالة", recall: "التراجع عن إرسال رسالة", delete: "حذف رسالة لدي", remove: "حذف رسالة بواسطة مدير النظام" };
  await recordActivity(actor, names[parsed.action], "المحادثات");
}
export async function inspectChats(actor: UserSession) { if (actor.position !== "system_admin") throw new ChatError("الإشراف متاح لمدير النظام فقط.", 403); return (await readRecord<ChatMessage[]>(KEY, [])).slice().reverse(); }
