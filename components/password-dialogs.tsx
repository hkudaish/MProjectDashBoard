"use client";
import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SessionInfo } from "@/lib/user-types";

export function PasswordChangeDialog({ open, required, onOpenChange, onSaved, onLogout }: { open: boolean; required: boolean; onOpenChange: (open: boolean) => void; onSaved: (session: SessionInfo) => void; onLogout: () => Promise<void> }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function clear() { setCurrentPassword(""); setNewPassword(""); setConfirmation(""); setError(""); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmation) { setError("كلمتا المرور الجديدتان غير متطابقتين."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await response.json() as SessionInfo & { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر تغيير كلمة المرور.");
      clear(); onSaved(data); onOpenChange(false); toast.success("تم تغيير كلمة المرور وتفعيل صلاحيات الحساب.");
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر تغيير كلمة المرور."); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!required && !saving) { if (!value) clear(); onOpenChange(value); } }}>
    <DialogContent dir="rtl" className="rounded-3xl text-right sm:max-w-md" showCloseButton={!required && !saving} onEscapeKeyDown={(event) => { if (required || saving) event.preventDefault(); }} onInteractOutside={(event) => { if (required || saving) event.preventDefault(); }}>
      <DialogHeader className="text-right sm:text-right"><DialogTitle>{required ? "تغيير كلمة المرور مطلوب" : "تغيير كلمة المرور"}</DialogTitle><DialogDescription>{required ? "لإكمال الدخول، غيّر كلمة المرور المؤقتة التي تسلمتها من مسؤول النظام. لا يمكنك استخدام صلاحيات الحساب قبل تغييرها." : "اختر كلمة مرور خاصة بك لا تقل عن 10 أحرف."}</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={saving} className="grid gap-4">
          <label className="grid gap-2 text-sm font-bold">كلمة المرور الحالية أو المؤقتة<Input type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
          <label className="grid gap-2 text-sm font-bold">كلمة المرور الجديدة<Input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
          <label className="grid gap-2 text-sm font-bold">تأكيد كلمة المرور الجديدة<Input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <DialogFooter><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <KeyRound />}حفظ كلمة المرور</Button><Button type="button" variant="outline" disabled={saving} onClick={() => { if (required) { void onLogout().then(clear); } else { clear(); onOpenChange(false); } }}>{required ? "تسجيل الخروج" : "إلغاء"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
export function PasswordResetRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return <Dialog open={open} onOpenChange={(value) => { if (!saving) { if (!value) { setEmail(""); setMessage(""); setError(""); } onOpenChange(value); } }}>
    <DialogContent dir="rtl" className="rounded-3xl text-right sm:max-w-md">
      <DialogHeader className="text-right sm:text-right"><DialogTitle>طلب إعادة ضبط كلمة المرور</DialogTitle><DialogDescription>أدخل بريد حسابك ليظهر الطلب لدى مسؤول النظام، ثم تواصل معه لاستلام كلمة مرور مؤقتة جديدة.</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); setSaving(true); setError(""); setMessage(""); void fetch("/api/auth/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).then(async (response) => { const data = await response.json() as { message: string; error?: string }; if (!response.ok) throw new Error(data.error || "تعذر إرسال الطلب."); setMessage(data.message); }).catch((error: unknown) => setError(error instanceof Error ? error.message : "تعذر إرسال الطلب.")).finally(() => setSaving(false)); }}>
        <label className="grid gap-2 text-sm font-bold">البريد الإلكتروني<Input type="email" autoComplete="username" required maxLength={254} disabled={saving} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{message}</p>}{error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <DialogFooter><Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />}إرسال الطلب</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
