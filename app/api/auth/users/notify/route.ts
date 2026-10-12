import { z } from "zod";
import { getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { emailSchema, findAccount, verifyPassword } from "@/lib/user-accounts";
import { createProjectStore } from "@/lib/project-store";
import { gmailConfigured, sendGmailMail } from "@/lib/gmail-mail";
import { welcomeMail } from "@/lib/welcome-mail";
import { recordActivity } from "@/lib/activity-log";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const actor = await getSystemAdminSession(request.headers);
  if (!actor) return Response.json({ error: "إشعار المستخدمين متاح لمدير النظام فقط." }, { status: 403 });
  const parsed = z.object({ email: emailSchema, projectId: z.string().min(1).max(120) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "حدد المستخدم والمشروع الحالي." }, { status: 400 });
  try {
    const [account, projects] = await Promise.all([findAccount(parsed.data.email), createProjectStore().getProjects()]);
    if (!account?.active) return Response.json({ error: "الحساب غير موجود أو غير نشط. فعّل الحساب أولًا." }, { status: 400 });
    const project = projects.find(item => item.id === parsed.data.projectId);
    if (!project) return Response.json({ error: "المشروع المحدد غير موجود." }, { status: 400 });
    const passwordMode = account.mustChangePassword ? await verifyPassword(account.loginEmail, account.passwordHash) ? "email" : "temporary" : "private";
    const mail = welcomeMail({ name: account.name, loginEmail: account.loginEmail, projectName: project.name, passwordMode, url: process.env.URL });
    if (process.env.REGISTRATION_MAIL_PROVIDER === "gmail") {
      if (!(await gmailConfigured())) return Response.json({ error: "اربط خدمة Gmail قبل إرسال الإشعار." }, { status: 503 });
      await sendGmailMail({ to: account.loginEmail, ...mail });
    } else {
      if (!process.env.RESEND_API_KEY || !process.env.REGISTRATION_MAIL_FROM) return Response.json({ error: "خدمة البريد غير مهيأة." }, { status: 503 });
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.REGISTRATION_MAIL_FROM, to: [account.loginEmail], ...mail }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Mail delivery failed");
    }
    await recordActivity(actor, "إرسال إشعار ترحيبي للمستخدم", `المستخدمون: ${account.name} (${account.loginEmail})`);
    return Response.json({ message: "تم إرسال الرسالة الترحيبية إلى بريد المستخدم." }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "تعذر إرسال الإشعار. تحقق من ربط البريد ثم حاول مجددًا." }, { status: 503 }); }
}
