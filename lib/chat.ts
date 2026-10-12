import { randomUUID } from "node:crypto";
import { z } from "zod";
import { listUsers } from "./user-accounts";
import { readRecord, updateRecord } from "./versioned-store";
import { recordActivity } from "./activity-log";
import type { UserSession } from "./user-types";
import type { ChatMessage } from "./chat-types";
import { LEADERSHIP_POSITIONS, type PublicUser } from "./user-types";
const KEY = "chat-messages-v1";
export const chatSendSchema = z.object({ recipient: z.union([z.literal("all"), z.string().email().max(254)]).optional(), recipients: z.array(z.string().email().max(254)).min(1).max(500).refine(values => new Set(values).size === values.length, "اختر كل مستخدم مرة واحدة.").optional(), text: z.string().trim().min(1).max(4000) }).strict().refine(value => Boolean(value.recipient) !== Boolean(value.recipients), "اختر مستلمًا أو قائمة مستلمين.");
export const chatActionSchema = z.object({ id: z.string().uuid(), action: z.enum(["edit", "recall", "delete", "remove"]), text: z.string().trim().min(1).max(4000).optional() }).strict();
export class ChatError extends Error { constructor(message: string, public status = 400) { super(message); } }
function visible(message: ChatMessage, email: string) { return (message.sender === email || message.recipient === email) && !message.deletedFor.includes(email); }
function canMessage(actor: UserSession, target: PublicUser) { return actor.position === "system_admin" || actor.canMessageLeadership === true || !target.position || !LEADERSHIP_POSITIONS.includes(target.position); }
export async function chatOverview(actor: UserSession) {
  const [users, messages] = await Promise.all([listUsers(), readRecord<ChatMessage[]>(KEY, [])]);
  const unread = messages.filter(m => m.recipient === actor.email && !m.readAt && !m.recalledAt && !m.removedAt && !m.deletedFor.includes(actor.email));
  return { unread: unread.length, currentUser: { email: actor.email, name: actor.name, position: actor.position }, contacts: users.filter(u => u.active && u.email !== actor.email).sort((a, b) => Number(b.position === "system_admin") - Number(a.position === "system_admin") || a.name.localeCompare(b.name, "ar")).map(u => ({ email: u.email, name: u.name, position: u.position, canMessage: canMessage(actor, u), unread: unread.filter(m => m.sender === u.email).length })) };
}
export async function chatConversation(actor: UserSession, peer: string) { return (await readRecord<ChatMessage[]>(KEY, [])).filter(m => visible(m, actor.email) && (m.sender === peer || m.recipient === peer)); }
export async function readChat(actor: UserSession, peer: string) {
  await updateRecord<ChatMessage[], void>(KEY, [], messages => { for (const m of messages) if (m.sender === peer && m.recipient === actor.email && !m.readAt && !m.deletedFor.includes(actor.email)) m.readAt = new Date().toISOString(); });
}
export async function sendChat(actor: UserSession, input: z.infer<typeof chatSendSchema>) {
  const parsed = chatSendSchema.parse(input);
  const broadcast = parsed.recipient === "all" || Boolean(parsed.recipients);
  if (broadcast && actor.position !== "system_admin") throw new ChatError("الإرسال الجماعي متاح لمدير النظام فقط.", 403);
  const users = (await listUsers()).filter(u => u.active && u.email !== actor.email);
  const requested = parsed.recipients;
  const recipients = parsed.recipient === "all" ? users : users.filter(u => requested ? requested.includes(u.email) : u.email === parsed.recipient);
  if (requested && recipients.length !== requested.length) throw new ChatError("أحد المستلمين غير متاح. حدّث القائمة وحدد المستخدمين النشطين.");
  if (!recipients.length) throw new ChatError("لا يوجد مستخدمون نشطون متاحون للإرسال.");
  if (recipients.some(target => !canMessage(actor, target))) throw new ChatError("مراسلة الأمين العام ومساعديه تتطلب اعتماد مدير النظام.", 403);
  const broadcastId = broadcast ? randomUUID() : undefined;
  const createdAt = new Date().toISOString();
  const copies: ChatMessage[] = recipients.map(u => ({ id: randomUUID(), sender: actor.email, recipient: u.email, text: parsed.text, createdAt, editedAt: null, readAt: null, recalledAt: null, removedAt: null, deletedFor: [], ...(broadcastId ? { broadcastId } : {}) }));
  await updateRecord<ChatMessage[], void>(KEY, [], messages => { messages.push(...copies); });
  await recordActivity(actor, broadcast ? "إرسال رسالة جماعية" : "إرسال رسالة", "المحادثات", { targetId: broadcastId || copies[0].id, details: [`المستلمون (${recipients.length}): ${recipients.map(user => user.name).join("، ")}`, "تم إرسال رسالة نصية؛ يُعرض محتواها داخل المحادثة"] }); return { ...copies[0], ...(broadcast ? { broadcastCount: copies.length } : {}) };
}
export async function sentBroadcasts(actor: UserSession) {
  if (actor.position !== "system_admin") throw new ChatError("الإرسال الجماعي متاح لمدير النظام فقط.", 403);
  const groups = new Map<string, ChatMessage[]>();
  for (const message of await readRecord<ChatMessage[]>(KEY, [])) if (message.sender === actor.email && message.broadcastId) groups.set(message.broadcastId, [...(groups.get(message.broadcastId) ?? []), message]);
  return [...groups.values()].filter(copies => !copies.every(m => m.deletedFor.includes(actor.email))).map(copies => ({ ...copies.find(m => !m.deletedFor.includes(actor.email))!, recipient: "all", broadcastCount: copies.length, readAt: copies.every(m => m.readAt || m.recalledAt || m.removedAt) ? copies[0].readAt : null }));
}
export async function changeChat(actor: UserSession, input: z.infer<typeof chatActionSchema>) {
  const parsed = chatActionSchema.parse(input);
  if (parsed.action === "remove" && actor.position !== "system_admin") throw new ChatError("الحذف للجميع متاح لمدير النظام فقط.", 403);
  const users = parsed.action === "edit" ? await listUsers() : [];
  await updateRecord<ChatMessage[], void>(KEY, [], messages => {
    const message = messages.find(m => m.id === parsed.id);
    if (!message || (parsed.action !== "remove" && !visible(message, actor.email))) throw new ChatError("الرسالة غير متاحة.", 404);
    const copies = message.broadcastId && (message.sender === actor.email || parsed.action === "remove") ? messages.filter(m => m.broadcastId === message.broadcastId) : [message];
    if (parsed.action === "remove") { for (const copy of copies) { copy.text = ""; copy.removedAt = new Date().toISOString(); } return; }
    if (parsed.action === "delete") { for (const copy of copies) if (!copy.deletedFor.includes(actor.email)) copy.deletedFor.push(actor.email); return; }
    if (message.sender !== actor.email) throw new ChatError("يمكنك تعديل رسائلك فقط.", 403);
    if (parsed.action === "edit" && copies.some(copy => { const target = users.find(u => u.email === copy.recipient); return target && !canMessage(actor, target); })) throw new ChatError("مراسلة الأمين العام ومساعديه تتطلب اعتماد مدير النظام.", 403);
    if (message.recalledAt || message.removedAt || Date.now() - Date.parse(message.createdAt) >= 60000) throw new ChatError("انتهت مهلة الدقيقة أو لم تعد الرسالة متاحة.");
    if (parsed.action === "edit") { if (!parsed.text) throw new ChatError("اكتب نص الرسالة."); for (const copy of copies) { if (!copy.removedAt && !copy.recalledAt) { copy.text = parsed.text; copy.editedAt = new Date().toISOString(); } } }
    else { for (const copy of copies) { copy.text = ""; copy.recalledAt = new Date().toISOString(); } }
  });
  const names = { edit: "تعديل رسالة", recall: "التراجع عن إرسال رسالة", delete: "حذف رسالة لدي", remove: "حذف رسالة بواسطة مدير النظام" };
  await recordActivity(actor, names[parsed.action], "المحادثات", { targetId: parsed.id, details: [`معرّف الرسالة: ${parsed.id}`, parsed.action === "remove" ? "حذف الرسالة لجميع المشاركين" : parsed.action === "delete" ? "إخفاء الرسالة من حساب المستخدم فقط" : names[parsed.action]] });
}
export async function inspectChats(actor: UserSession) { if (actor.position !== "system_admin") throw new ChatError("الإشراف متاح لمدير النظام فقط.", 403); return (await readRecord<ChatMessage[]>(KEY, [])).slice().reverse(); }
