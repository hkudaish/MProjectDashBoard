import { simpleParser } from "mailparser";
import { z } from "zod";
import { sendGmailMail } from "./gmail-mail";
import { gmailAccessToken, gmailRequest } from "./gmail-api";
import type { InboxMessage } from "./mailbox-types";

export class MailboxError extends Error {}
export const messageIdSchema = z.string().max(40).regex(/^[a-f0-9]+$/i);
// Google's pagination tokens are opaque. URLSearchParams encodes them safely.
export const pageTokenSchema = z.string().min(1).max(2048).regex(/^[\x21-\x7e]+$/);
export const replySchema = z.object({ id: messageIdSchema, text: z.string().trim().min(1).max(20000) }).strict();
type GmailMessage = { id: string; threadId?: string; internalDate?: string; labelIds?: string[]; sizeEstimate?: number; raw?: string; payload?: { headers?: { name: string; value: string }[] } };
export async function listInbox(pageToken?: string) {
  if (pageToken) pageTokenSchema.parse(pageToken);
  const accessToken = await gmailAccessToken();
  const query = new URLSearchParams({ labelIds: "INBOX", maxResults: "20" });
  if (pageToken) query.set("pageToken", pageToken);
  const page = await gmailRequest<{ messages?: { id: string }[]; nextPageToken?: string }>("messages?" + query, {}, accessToken);
  const messages: InboxMessage[] = await Promise.all((page.messages ?? []).map(async ({ id }) => {
    const item = await gmailRequest<GmailMessage>("messages/" + encodeURIComponent(id) + "?format=metadata&metadataHeaders=Subject&metadataHeaders=From", {}, accessToken);
    const header = (name: string) => item.payload?.headers?.find(entry => entry.name.toLowerCase() === name.toLowerCase())?.value;
    const date = new Date(Number(item.internalDate));
    return { id: item.id, subject: header("Subject") || "بدون عنوان", from: header("From") || "مرسل غير معروف", date: Number.isFinite(date.getTime()) ? date.toISOString() : null, unread: item.labelIds?.includes("UNREAD") ?? false };
  }));
  return { messages, nextPageToken: page.nextPageToken ?? null };
}
async function readOriginal(id: string) {
  messageIdSchema.parse(id);
  const accessToken = await gmailAccessToken();
  const metadata = await gmailRequest<GmailMessage>("messages/" + id + "?format=minimal", {}, accessToken);
  if ((metadata.sizeEstimate ?? 0) > 10 * 1024 * 1024) throw new MailboxError("الرسالة كبيرة؛ افتحها من Gmail لعرض المرفقات.");
  const item = await gmailRequest<GmailMessage>("messages/" + id + "?format=raw", {}, accessToken);
  if (!item.raw || item.raw.length > 14 * 1024 * 1024) throw new MailboxError("تعذر قراءة الرسالة أو أنها كبيرة جدًا.");
  const parsed = await simpleParser(Buffer.from(item.raw, "base64url"), { skipImageLinks: true });
  const replyTo = z.string().email().safeParse(parsed.replyTo?.value[0]?.address || parsed.from?.value[0]?.address || "");
  return { detail: { id, subject: parsed.subject || "بدون عنوان", from: parsed.from?.text || "مرسل غير معروف", date: parsed.date?.toISOString() ?? null, unread: item.labelIds?.includes("UNREAD") ?? false, text: parsed.text || "لا يوجد محتوى نصي متاح لهذه الرسالة.", replyTo: replyTo.success ? replyTo.data : "" }, threadId: item.threadId, messageId: parsed.messageId, references: parsed.references };
}
export async function readInboxMessage(id: string) { return (await readOriginal(id)).detail; }
export async function replyToInbox(id: string, text: string) {
  const input = replySchema.parse({ id, text });
  const original = await readOriginal(input.id);
  if (!original.detail.replyTo) throw new MailboxError("لا يوجد عنوان صالح للرد على الرسالة.");
  const references = Array.isArray(original.references) ? original.references : original.references ? [original.references] : [];
  if (original.messageId) references.push(original.messageId);
  return sendGmailMail({ to: original.detail.replyTo, subject: /^Re:/i.test(original.detail.subject) ? original.detail.subject : `Re: ${original.detail.subject}`, text: input.text, inReplyTo: original.messageId, references: [...new Set(references)], threadId: original.threadId });
}
