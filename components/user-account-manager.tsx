"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { USER_ROLES, type PublicUser, type UserRole } from "@/lib/user-types";

export function UserAccountManager({ open, onOpenChange, currentEmail }: { open: boolean; onOpenChange: (open: boolean) => void; currentEmail: string }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ name: "", email: "", password: "", confirmation: "", role: "viewer" as UserRole });
  const [resetEmail, setResetEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/users", { cache: "no-store" });
      const data = await response.json() as { users: PublicUser[]; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الحسابات.");
      setUsers(data.users);
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر تحميل الحسابات."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!open) return; const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [open, load]);
  async function mutate(method: "POST" | "PATCH", body: object) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/auth/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { user: PublicUser; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الحساب.");
      await load();
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر حفظ الحساب."); return false; }
    finally { setSaving(false); }
  }
  function close() {
    setDraft({ name: "", email: "", password: "", confirmation: "", role: "viewer" });
    setResetEmail(""); setTemporaryPassword(""); setConfirmation(""); setError(""); onOpenChange(false);
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!saving) { if (value) onOpenChange(true); else close(); } }}>
    <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto rounded-3xl text-right sm:max-w-5xl [&_[data-slot=dialog-close]]:right-auto [&_[data-slot=dialog-close]]:left-4">
      <DialogHeader className="text-right sm:text-right"><DialogTitle className="text-xl font-black">إدارة المستخدمين</DialogTitle><DialogDescription>أنشئ الحسابات وحدد صلاحياتها. كل كلمة مرور جديدة أو معاد ضبطها مؤقتة، ويجب تغييرها عند أول دخول.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-amber-800">{users.filter((u) => u.resetRequestedAt).length} طلبات إعادة ضبط معلقة</p><Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void load()}><RefreshCw />تحديث القائمة</Button></div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p className="text-sm text-slate-500">جارٍ تحميل الحسابات...</p> : <Table className="min-w-[700px] text-right [&_th]:text-right">
        <TableHeader className="bg-teal-50"><TableRow><TableHead>المستخدم</TableHead><TableHead>الصلاحية</TableHead><TableHead>حالة الحساب</TableHead><TableHead>كلمة المرور</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader>
        <TableBody>{users.map((user) => <TableRow key={user.email}>
          <TableCell><p className="font-bold">{user.name}</p><p dir="ltr" className="mt-1 text-right text-xs text-slate-500">{user.email}</p></TableCell>
          <TableCell><Select dir="rtl" value={user.role} disabled={saving || user.email === currentEmail} onValueChange={(role) => void mutate("PATCH", { email: user.email, role })}><SelectTrigger className="w-36 rounded-xl"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{Object.entries(USER_ROLES).map(([role, label]) => <SelectItem key={role} value={role}>{label}</SelectItem>)}</SelectContent></Select></TableCell>
          <TableCell><span className={`rounded-full px-2 py-1 text-xs font-bold ${user.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{user.active ? "نشط" : "معطل"}</span></TableCell>
          <TableCell className="whitespace-normal text-xs leading-6"><p>{user.mustChangePassword ? "يلزم تغيير كلمة المرور" : "كلمة مرور خاصة بالحساب"}</p>{user.resetRequestedAt && <p className="font-bold text-amber-800">طلب إعادة ضبط · {new Intl.DateTimeFormat("ar-SA", { dateStyle: "short" }).format(new Date(user.resetRequestedAt))}</p>}</TableCell>
          <TableCell><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={saving || user.email === currentEmail} onClick={() => { setResetEmail(user.email); setTemporaryPassword(""); setConfirmation(""); }}><KeyRound />إعادة ضبط</Button><Button variant="outline" size="sm" disabled={saving || user.email === currentEmail} onClick={() => void mutate("PATCH", { email: user.email, active: !user.active })}>{user.active ? "تعطيل" : "تفعيل"}</Button></div></TableCell>
        </TableRow>)}</TableBody>
      </Table>}
      {resetEmail && <form className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4" onSubmit={(event) => { event.preventDefault(); if (temporaryPassword !== confirmation) { setError("كلمتا المرور غير متطابقتين."); return; } void mutate("PATCH", { email: resetEmail, temporaryPassword }).then((ok) => { if (ok) { setResetEmail(""); setTemporaryPassword(""); setConfirmation(""); toast.success("تم تعيين كلمة مرور مؤقتة وإلغاء الجلسات السابقة. سلّمها لصاحب الحساب."); } }); }}>
        <h3 className="font-bold text-amber-900">إعادة ضبط كلمة مرور: <span dir="ltr">{resetEmail}</span></h3>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">كلمة المرور المؤقتة<Input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} /></label><label className="grid gap-2 text-sm font-bold">تأكيد كلمة المرور المؤقتة<Input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label></fieldset>
        <p className="text-xs leading-6 text-amber-900">سيُلزم المستخدم بتغيير هذه الكلمة عند أول دخول بعد إعادة الضبط.</p>
        <div className="flex gap-2"><Button disabled={saving} type="submit">تعيين كلمة مؤقتة</Button><Button variant="outline" type="button" disabled={saving} onClick={() => { setResetEmail(""); setTemporaryPassword(""); setConfirmation(""); }}>إلغاء</Button></div>
      </form>}
      <form onSubmit={(event) => { event.preventDefault(); if (draft.password !== draft.confirmation) { setError("كلمتا المرور غير متطابقتين."); return; } void mutate("POST", draft).then((ok) => { if (ok) { setDraft({ name: "", email: "", password: "", confirmation: "", role: "viewer" }); toast.success("تم إنشاء الحساب. سلّم كلمة المرور المؤقتة لصاحب الحساب."); } }); }} className="grid gap-4 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
        <h3 className="font-black text-teal-900">إنشاء حساب مستخدم</h3>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">اسم المستخدم<Input required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">البريد الإلكتروني<Input type="email" dir="ltr" autoComplete="off" required maxLength={254} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">كلمة المرور المؤقتة<Input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">تأكيد كلمة المرور<Input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={draft.confirmation} onChange={(e) => setDraft({ ...draft, confirmation: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">صلاحيات الاستخدام<Select dir="rtl" value={draft.role} disabled={saving} onValueChange={(role) => setDraft({ ...draft, role: role as UserRole })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{Object.entries(USER_ROLES).map(([role, label]) => <SelectItem key={role} value={role}>{label}</SelectItem>)}</SelectContent></Select></label>
        </fieldset>
        <p className="text-xs leading-6 text-slate-600">مسؤول النظام: إدارة الحسابات والبيانات. المحرر: إضافة وتعديل المنتجات والمهام. المشاهد: الاطلاع فقط. كلمة المرور لا تقل عن 10 أحرف.</p>
        <DialogFooter><Button type="submit" disabled={saving || loading}>{saving ? <Loader2 className="animate-spin" /> : <UserPlus />}إنشاء الحساب</Button><Button type="button" variant="outline" disabled={saving} onClick={close}>إغلاق</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
