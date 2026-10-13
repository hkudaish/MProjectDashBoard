"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PasswordResetRequestDialog } from "@/components/password-dialogs";
import { clearTaskUndo } from "@/lib/task-undo";
import type { SessionInfo } from "@/lib/user-types";

export function LoginDialog({ open, onOpenChange, configured, onSignedIn }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configured: boolean;
  onSignedIn: (session: SessionInfo) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  function changeOpen(next: boolean) {
    if (saving) return;
    setError("");
    setPassword("");
    onOpenChange(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const session = await response.json() as SessionInfo & { error?: string };
      if (!response.ok || !session.authenticated) throw new Error(session.error || "تعذر تسجيل الدخول.");
      clearTaskUndo();
      onSignedIn(session);
      setPassword("");
      onOpenChange(false);
      toast.success(session.mustChangePassword ? "غيّر كلمة المرور لإكمال الدخول." : "تم تسجيل الدخول");
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر تسجيل الدخول.");
    } finally {
      setSaving(false);
    }
  }
  return <>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent dir="rtl" className="text-right sm:max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>تسجيل الدخول</DialogTitle>
          <DialogDescription>أدخل بريد حسابك وكلمة المرور. تحدد صلاحيات الحساب إمكانية التعديل وإدارة المستخدمين.</DialogDescription>
        </DialogHeader>
        <form onSubmit={event => void submit(event)} className="grid gap-4">
          <label className="grid gap-2 text-sm font-bold">البريد الإلكتروني<Input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-bold">كلمة المرور<Input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
          {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
          {!configured && <p role="alert" className="text-sm text-amber-800">تسجيل الدخول غير مُعدّ على الخادم.</p>}
          <Button type="button" variant="link" className="justify-start px-0 text-teal-800" disabled={saving} onClick={() => { changeOpen(false); setResetOpen(true); }}>نسيت كلمة المرور؟ طلب إعادة ضبط</Button>
          <DialogFooter className="flex-row-reverse justify-start sm:justify-start">
            <Button type="submit" disabled={saving || !configured}>{saving ? <Loader2 className="animate-spin" /> : <LogIn />}دخول</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </form>
        <div className="border-t border-slate-200 pt-4">
          <p className="mb-3 text-sm text-slate-600">ليس لديك حساب؟ أرسل طلب تسجيل إلى مدير النظام.</p>
          {saving ? <Button variant="outline" className="w-full" disabled><UserPlus className="size-4" />طلب تسجيل جديد</Button> : <Button asChild variant="outline" className="w-full border-teal-200 text-teal-800"><Link href="/settings/registration" onClick={() => changeOpen(false)}><UserPlus className="size-4" />طلب تسجيل جديد</Link></Button>}
        </div>
      </DialogContent>
    </Dialog>
    <PasswordResetRequestDialog open={resetOpen} onOpenChange={setResetOpen} />
  </>;
}
