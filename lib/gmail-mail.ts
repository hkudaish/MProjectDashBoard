import nodemailer from "nodemailer";
import { gmailAddress, gmailRequest } from "./gmail-api";
import { applicationMailSubject } from "./application-mail";
export { gmailAddress, gmailConfigured } from "./gmail-api";

export async function sendGmailMail(mail: { to: string; subject: string; text: string; messageId?: string; inReplyTo?: string; references?: string[]; threadId?: string }) {
  // Build MIME locally. Delivery uses HTTPS only, never SMTP.
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows", disableFileAccess: true, disableUrlAccess: true });
  const { threadId, ...content } = mail;
  const result = await transport.sendMail({ ...content, subject: applicationMailSubject(content.subject), from: gmailAddress(), replyTo: gmailAddress(), headers: { "X-MProjDashboard": "application-mail" } });
  if (!Buffer.isBuffer(result.message)) throw new Error("Could not build MIME message");
  const response = await gmailRequest<{ id: string }>("messages/send", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: result.message.toString("base64url"), ...(threadId ? { threadId } : {}) }),
  });
  if (!response.id) throw new Error("Gmail did not confirm sending");
  return response.id;
}
