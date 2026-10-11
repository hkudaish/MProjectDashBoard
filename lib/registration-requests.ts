import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getLocalStore } from "./local-store";
import { listUsers, findAccount, emailSchema } from "./user-accounts";
import { gmailConfigured, sendGmailMail, gmailAddress } from "./gmail-mail";
import type { RegistrationRequest, RegistrationStatus } from "./registration-types";

const KEY = "registration-requests-v1";
let memory: { data: RegistrationRequest[]; etag: string } | null = null;
export const registrationInputSchema = z.object({
  name: z.string().trim().min(1).max(120), jobTitle: z.string().trim().min(1).max(120),
  department: z.string().trim().min(1).max(120), email: emailSchema,
}).strict();
export const reviewInputSchema = z.object({ id: z.string().uuid(), status: z.enum(["approved", "rejected", "on_hold"]), note: z.string().trim().max(2000).default("") }).strict();
export class RegistrationError extends Error {}
function store() {
  return getLocalStore() ?? (process.env.NODE_ENV === "production" && process.env.TASK_STORE_MODE !== "memory" ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null);
}
async function snapshot() {
  const storage = store();
  const result = storage ? await storage.getWithMetadata(KEY, { type: "json" }) : memory;
  return result ? { data: result.data as RegistrationRequest[], etag: result.etag } : null;
}
async function update<T>(action: (items: RegistrationRequest[]) => T): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const previous = await snapshot();
    const items = structuredClone(previous?.data ?? []);
    const result = action(items);
    const storage = store();
    if (storage) {
      const written = await storage.setJSON(KEY, items, previous ? { onlyIfMatch: previous.etag } : { onlyIfNew: true });
      if (written.modified) return result;
    } else if (memory?.etag === previous?.etag) {
      memory = { data: items, etag: randomUUID() }; return result;
    }
  }
  throw new RegistrationError("حدث تعديل متزامن. حاول مرة أخرى.");
}
function notify(request: RegistrationRequest, to: string, subject: string, text: string) {
  request.notifications.push({ id: randomUUID(), to, subject, text, status: "queued", sentAt: null });
}
export async function registrationMailConfigured() { return process.env.REGISTRATION_MAIL_PROVIDER === "gmail" ? gmailConfigured() : Boolean(process.env.RESEND_API_KEY && process.env.REGISTRATION_MAIL_FROM); }
export async function registrationMailMode(): Promise<"unconfigured" | "test" | "live"> {
  if (!(await registrationMailConfigured())) return "unconfigured";
  if (process.env.REGISTRATION_MAIL_PROVIDER === "gmail") return "live";
  return /@resend\.dev>?$/i.test(process.env.REGISTRATION_MAIL_FROM!.trim()) ? "test" : "live";
}
export async function flushRegistrationEmails(requestId?: string) {
  if (!(await registrationMailConfigured())) return;
  const items = ((await snapshot())?.data ?? []).filter(item => !requestId || item.id === requestId);
  for (const request of items) for (const mail of request.notifications.filter(item => item.status !== "sent")) {
    let sent = false;
    try {
      if (process.env.REGISTRATION_MAIL_PROVIDER === "gmail") {
        await sendGmailMail({ to: mail.to, subject: mail.subject, text: mail.text, messageId: `<${mail.id}@${gmailAddress().split("@")[1]}>` });
        sent = true;
      } else {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": mail.id },
        body: JSON.stringify({ from: process.env.REGISTRATION_MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(10000),
      });
      sent = response.ok;
      }
    } catch { /* Keep failed messages available for retry. */ }
    await update(records => {
      const saved = records.find(item => item.id === request.id)?.notifications.find(item => item.id === mail.id);
      if (saved && saved.status !== "sent") { saved.status = sent ? "sent" : "failed"; saved.sentAt = sent ? new Date().toISOString() : null; }
    });
    if (!sent) break;
  }
}
export async function submitRegistration(input: z.infer<typeof registrationInputSchema>) {
  const parsed = registrationInputSchema.parse(input);
  const users = await listUsers();
  if (users.some(user => user.loginEmail === parsed.email)) return;
  const admins = users.filter(user => user.active && user.position === "system_admin");
  const id = await update(items => {
    if (items.some(item => item.email === parsed.email && (item.status !== "rejected" || Date.now() - Date.parse(item.createdAt) < 86400000))) return;
    const now = new Date().toISOString();
    const request: RegistrationRequest = { ...parsed, id: randomUUID(), status: "pending", createdAt: now, updatedAt: now, note: "", reviewedBy: null, notifications: [] };
    for (const admin of admins) notify(request, admin.loginEmail, "طلب تسجيل جديد", `ورد طلب تسجيل جديد في التطبيق.\nالاسم: ${request.name}\nالمسمى الوظيفي: ${request.jobTitle}\nالإدارة: ${request.department}\nالبريد الإلكتروني: ${request.email}\nراجع الطلب من الإعدادات ← طلبات التسجيل.`);
    items.push(request);
    return request.id;
  });
  if (id) await flushRegistrationEmails(id);
}
export async function approvedRegistration(id: string, email: string) {
  const request = (await snapshot())?.data.find(item => item.id === id);
  if (!request || request.status !== "approved" || request.email !== email.trim().toLowerCase()) throw new RegistrationError("الطلب غير موافق عليه أو البريد لا يطابق الطلب.");
  return request;
}
export async function activateRegistration(id: string, email: string) {
  const account = await findAccount(email);
  if (!account?.active || account.registrationRequestId !== id) throw new RegistrationError("لم يكتمل اعتماد حساب هذا الطلب.");
  await update(items => {
    const request = items.find(item => item.id === id);
    if (!request || request.email !== account.loginEmail) throw new RegistrationError("الطلب غير موجود.");
    if (request.status === "activated") return;
    request.status = "activated"; request.updatedAt = new Date().toISOString();
    notify(request, request.email, "تم تفعيل حسابك", `مرحبًا ${request.name}،\nاكتمل اعتماد حسابك وتفعيله في التطبيق.\nبريد الدخول: ${account.loginEmail}\nتواصل مع مدير النظام لاستلام كلمة المرور المؤقتة، ثم غيّرها عند أول تسجيل دخول.${process.env.URL ? `\nرابط التطبيق: ${process.env.URL}` : ""}`);
  });
  await flushRegistrationEmails(id);
}
export async function listRegistrations() {
  // Recover an interrupted activation after account creation without creating it twice.
  for (const request of (await snapshot())?.data ?? []) if (request.status === "approved") {
    const account = await findAccount(request.email);
    if (account?.active && account.registrationRequestId === request.id) await activateRegistration(request.id, account.email);
  }
  return (await snapshot())?.data ?? [];
}
export async function reviewRegistration(input: z.infer<typeof reviewInputSchema>, reviewer: string) {
  const parsed = reviewInputSchema.parse(input);
  const result = await update(items => {
    const request = items.find(item => item.id === parsed.id);
    if (!request || request.status === "activated") throw new RegistrationError("الطلب غير موجود أو تم تفعيل حسابه بالفعل.");
    if (request.status === parsed.status && request.note === parsed.note) return request;
    request.status = parsed.status; request.note = parsed.note; request.reviewedBy = reviewer; request.updatedAt = new Date().toISOString();
    const messages: Partial<Record<RegistrationStatus, [string, string]>> = {
      approved: ["الموافقة على طلب تسجيلك", "تمت الموافقة على طلبك مبدئيًا، وسيتم إشعارك عند اكتمال اعتماد حسابك وتفعيله."],
      rejected: ["نتيجة طلب تسجيلك", "نعتذر، تم رفض طلب تسجيلك."],
      on_hold: ["تعليق طلب تسجيلك", "تم تعليق طلب تسجيلك لحين استكمال المراجعة أو البيانات المطلوبة. تواصل مع مدير النظام."],
    };
    const [subject, text] = messages[parsed.status]!;
    notify(request, request.email, subject, `مرحبًا ${request.name}،\n${text}${parsed.note ? `\nملاحظات مدير النظام: ${parsed.note}` : ""}`);
    return request;
  });
  await flushRegistrationEmails(result.id);
  return result;
}
