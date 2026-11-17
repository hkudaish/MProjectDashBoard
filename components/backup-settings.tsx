"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettingsWorkspace } from "@/components/settings-workspace";
import { ArchiveRestore, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BackupEntry } from "@/lib/backups";
import type { BackupSummary } from "@/lib/backup-format";

const labels: Record<string, string> = { tasks: "المهام", products: "المنتجات", projects: "المشاريع", entities: "الجهات", "user-accounts-v1": "حسابات المستخدمين", "admin-emails": "قائمة المديرين الإضافية", "registration-requests-v1": "طلبات التسجيل", "chat-messages-v1": "المحادثات", "activity-log-v1": "سجل العمليات", "gmail-oauth-v1": "بيانات ربط البريد" };
type Preview = { createdAt: string; createdBy: string; summary: BackupSummary; currentSummary: BackupSummary; token: string };
const date = (value: string) => new Date(value).toLocaleString("ar-SA");
async function post<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(data.error || "تعذر إتمام العملية."); return data;
}
function download(id: string) { const anchor = document.createElement("a"); anchor.href = `/api/backups?id=${encodeURIComponent(id)}`; anchor.download = ""; anchor.click(); }
async function loadHistory() {
  const response = await fetch("/api/backups", { cache: "no-store" });
  const data = await response.json() as { backups: BackupEntry[]; error?: string };
  if (!response.ok) throw new Error(data.error || "تعذر تحميل النسخ.");
  return data.backups;
}
export function BackupSettings() {
  const router = useRouter();
  const { refresh: refreshSession } = useSettingsWorkspace();
  const [backups, setBackups] = useState<BackupEntry[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [password, setPassword] = useState(""), [passwordAgain, setPasswordAgain] = useState("");
  const [file, setFile] = useState<unknown>(null), [fileName, setFileName] = useState(""), [restorePassword, setRestorePassword] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null), [confirmation, setConfirmation] = useState(""), [loginEmail, setLoginEmail] = useState(""), [loginPassword, setLoginPassword] = useState("");
  async function refresh() {
    try { setBackups(await loadHistory()); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل النسخ."); } finally { setLoading(false); }
  }
  useEffect(() => {
    let cancelled = false;
    void loadHistory().then(entries => { if (!cancelled) setBackups(entries); }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "تعذر تحميل النسخ."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  async function run(action: () => Promise<void>) { setError(""); setMessage(""); setBusy(true); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "تعذر إتمام العملية."); } finally { setBusy(false); } }
  async function chooseFile(selected: File | undefined) {
    setPreview(null); setFile(null); setConfirmation(""); setError(""); setFileName(selected?.name || "");
    if (!selected) return;
    if (selected.size > 4 * 1024 * 1024) { setError("الحد الأقصى للملف 4 ميجابايت."); return; }
    try { setFile(JSON.parse(await selected.text())); } catch { setError("اختر ملف نسخة احتياطية صالحًا بصيغة JSON."); }
  }
  const box = "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
  return <div className="space-y-5" aria-busy={busy}>
    <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm leading-7 text-teal-950"><ShieldCheck className="mb-2 size-5" />تشمل النسخة جميع بيانات النظام والحسابات وكلمات المرور المحفوظة بصيغتها المشفّرة والمحادثات وسجل العمليات وربط البريد. الملفات محمية بكلمة مرور تختارها؛ احتفظ بها لاستعادة النسخة. إعدادات الاستضافة ومفاتيح الخدمات الخارجية وملفات التطبيق وسجل النسخ الاحتياطية نفسه لا تدخل في ملف البيانات.</div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-teal-50 p-4 text-sm text-teal-900">{message}</p>}
    <section className={box}><h2 className="text-lg font-bold">إنشاء نسخة كاملة</h2><p className="mt-2 text-sm leading-7 text-slate-500">تُحفظ النسخة في النظام ويبدأ تنزيل ملف مشفّر إلى جهازك. الحد الأقصى 4 ميجابايت.</p>
      <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); void run(async () => { if (password !== passwordAgain) throw new Error("كلمتا مرور النسخة غير متطابقتين."); const data = await post<{ backup: BackupEntry }>({ action: "create", password }); download(data.backup.id); setPassword(""); setPasswordAgain(""); setMessage("حُفظت النسخة وبدأ التنزيل. احتفظ بالملف وكلمة مروره في مكان آمن."); await refresh(); }); }}>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">كلمة مرور النسخة<Input type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="12 حرفًا على الأقل" /></label><label className="space-y-2 text-sm font-medium">تأكيد كلمة المرور<Input type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={passwordAgain} onChange={event => setPasswordAgain(event.target.value)} /></label></fieldset>
        <Button disabled={busy || loading} type="submit"><Download className="size-4" />إنشاء وتنزيل نسخة</Button>
      </form>
    </section>
    <section className={box}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">النسخ المحفوظة</h2><Button variant="outline" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw className="size-4" />تحديث</Button></div>
      {loading ? <p role="status" className="mt-4 text-sm text-slate-500">جارٍ تحميل النسخ…</p> : !backups.length ? <p className="mt-4 text-sm text-slate-500">لا توجد نسخ محفوظة بعد.</p> : <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">{backups.map(entry => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="min-w-0"><p className="font-bold">{entry.reason === "before-restore" ? "نسخة تعافٍ تلقائية قبل الاستعادة" : "نسخة يدوية كاملة"}</p><p className="mt-1 text-xs leading-6 text-slate-500">{date(entry.createdAt)} · <bdi>{entry.createdBy}</bdi></p><p className="text-xs text-slate-500">{entry.summary.find(item => item.key === "tasks")?.count ?? 0} مهمة · {entry.summary.find(item => item.key === "user-accounts-v1")?.count ?? 0} حساب</p></div><Button variant="outline" disabled={busy} onClick={() => download(entry.id)}><Download className="size-4" />تنزيل</Button></div>)}</div>}
    </section>
    <section className={box}><h2 className="text-lg font-bold">استعادة نسخة احتياطية</h2><p className="mt-2 text-sm leading-7 text-slate-500">اختر الملف وأدخل كلمة مروره لمراجعة محتوياته أولًا. الاستعادة تستبدل جميع البيانات. تُحفظ نسخة تعافٍ تلقائية بكلمة مرور الملف نفسه، وتُلغى جلسات الدخول الحالية. استخدم حساب مدير موجود في النسخة بعد الاستعادة.</p>
      <fieldset disabled={busy} className="mt-4 space-y-4"><label className="block space-y-2 text-sm font-medium">ملف النسخة<Input type="file" accept=".json,application/json" onChange={event => void chooseFile(event.target.files?.[0])} /></label><label className="block space-y-2 text-sm font-medium">كلمة مرور الملف<Input type="password" autoComplete="off" value={restorePassword} onChange={event => { setRestorePassword(event.target.value); setPreview(null); }} /></label><Button variant="outline" disabled={!file || restorePassword.length < 12} onClick={() => void run(async () => { setPreview(null); setConfirmation(""); setPreview(await post<Preview>({ action: "preview", file, password: restorePassword })); })}>معاينة النسخة</Button></fieldset>
      {preview && <div className="mt-5 space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-bold text-amber-950">مراجعة الاستعادة</h3><p className="break-words text-sm leading-7">{fileName} · {date(preview.createdAt)} · <bdi>{preview.createdBy}</bdi></p><div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr className="border-b border-amber-200"><th className="p-2 text-start">البيانات</th><th className="p-2 text-start">الحالي</th><th className="p-2 text-start">بعد الاستعادة</th></tr></thead><tbody>{preview.summary.map(item => <tr key={item.key} className="border-b border-amber-100"><td className="p-2">{labels[item.key]}</td><td className="p-2">{preview.currentSummary.find(row => row.key === item.key)?.count ?? 0}</td><td className="p-2">{item.count}</td></tr>)}</tbody></table></div>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run(async () => { const result = await post<{ recoveryId: string }>({ action: "restore", file, password: restorePassword, token: preview.token, confirmation, loginEmail, loginPassword }); setMessage(`اكتملت الاستعادة. حُفظت نسخة التعافي ${result.recoveryId}. جارٍ الانتقال لتسجيل الدخول…`); await refreshSession(); router.replace("/settings/account"); router.refresh(); }); }}><fieldset disabled={busy} className="space-y-4"><p className="text-sm leading-7">لضمان قدرتك على الدخول، تحقق من بيانات مدير النظام داخل النسخة المختارة. لن تُغيّر كلمات مرور الحسابات.</p><label className="block space-y-2 text-sm font-medium">بريد مدير النظام في النسخة<Input type="email" dir="ltr" required autoComplete="off" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} /></label><label className="block space-y-2 text-sm font-medium">كلمة مرور حساب المدير في النسخة<Input type="password" required autoComplete="off" value={loginPassword} onChange={event => setLoginPassword(event.target.value)} /></label><label className="block space-y-2 text-sm font-medium">اكتب «استعادة» لتأكيد استبدال جميع البيانات<Input required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><Button variant="destructive" type="submit" disabled={confirmation !== "استعادة"}><ArchiveRestore className="size-4" />استعادة جميع البيانات</Button></fieldset></form>
      </div>}
    </section>
  </div>;
}
