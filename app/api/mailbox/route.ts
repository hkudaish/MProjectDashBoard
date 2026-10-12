import { withActivity } from "@/lib/activity-log";
import { getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { gmailConfigured, gmailAddress } from "@/lib/gmail-mail";
import { listInbox, readInboxMessage, replyToInbox, replySchema, messageIdSchema, pageTokenSchema, MailboxError } from "@/lib/gmail-inbox";
import { oauthReady } from "@/lib/gmail-api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  if (!(await getSystemAdminSession(request.headers))) return Response.json({ error: "البريد متاح لمدير النظام فقط." }, { status: 403, headers });
  if (!(await gmailConfigured())) return Response.json({ configured: false, oauthReady: oauthReady(), email: gmailAddress(), messages: [], nextPageToken: null }, { headers });
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const pageToken = params.get("pageToken");
  if (id && !messageIdSchema.safeParse(id).success || pageToken && !pageTokenSchema.safeParse(pageToken).success) return Response.json({ error: "بيانات الرسالة غير صالحة." }, { status: 400, headers });
  try { return Response.json(id ? { message: await readInboxMessage(id) } : { configured: true, oauthReady: oauthReady(), email: gmailAddress(), ...await listInbox(pageToken ?? undefined) }, { headers }); }
  catch (error) { return Response.json({ oauthReady: oauthReady(), error: error instanceof MailboxError ? error.message : "تعذر الاتصال بـ Gmail API. تحقق من الربط والصلاحيات أو أعد ربط حساب Google." }, { status: error instanceof MailboxError ? error.status : 503, headers }); }
}
async function handlePOST(request: Request) {
  if (!hasSameOrigin(request) || !(await getSystemAdminSession(request.headers))) return Response.json({ error: "الإجراء متاح لمدير النظام فقط." }, { status: 403, headers });
  const parsed = replySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "أدخل نص الرد واختر رسالة صالحة." }, { status: 400, headers });
  try { return Response.json({ messageId: await replyToInbox(parsed.data.id, parsed.data.text), message: "تم إرسال الرد." }, { headers }); }
  catch (error) { return Response.json({ error: error instanceof MailboxError ? error.message : "تعذر إرسال الرد. تحقق من ربط Gmail." }, { status: error instanceof MailboxError ? error.status : 503, headers }); }
}

export const POST = withActivity("إضافة", handlePOST);
