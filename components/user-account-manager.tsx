"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { HierarchyPath } from "@/components/hierarchy-path";
import { supervisorChain } from "@/lib/hierarchy";
import { MANAGER_POSITIONS } from "@/lib/user-types";
import { UserHierarchyFields, type ManagerPosition } from "@/components/user-hierarchy-fields";
import { POSITIONS, type Entity, type Position, type PublicUser } from "@/lib/user-types";

export function UserAccountManager({ open, onOpenChange, currentEmail, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; currentEmail: string; onChanged: () => void }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [editingUser, setEditingUser] = useState<(PublicUser & { position: Position; managerPosition?: ManagerPosition }) | null>(null);
  const [deletingUser, setDeletingUser] = useState<PublicUser | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ name: "", email: "", password: "", confirmation: "", position: "employee" as Position, managerEmail: null as string | null, additionalManagerEmail: null as string | null, managerPosition: undefined as ManagerPosition | undefined, entityId: null as string | null });
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
      const entityResponse = await fetch("/api/entities", { cache: "no-store" });
      const entityData = await entityResponse.json() as { entities: Entity[]; error?: string };
      if (!entityResponse.ok) throw new Error(entityData.error || "تعذر تحميل الجهات.");
      setEntities(entityData.entities);
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر تحميل الحسابات."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!open) return; const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [open, load]);
  async function mutate(method: "POST" | "PATCH" | "DELETE", body: object) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/auth/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { user: PublicUser; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الحساب.");
      await load();
      onChanged();
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر حفظ الحساب."); return false; }
    finally { setSaving(false); }
  }
  function close() {
    setDraft({ name: "", email: "", password: "", confirmation: "", position: "employee", managerEmail: null, additionalManagerEmail: null, managerPosition: undefined, entityId: null });
    setEditingUser(null); setDeletingUser(null); setResetEmail(""); setTemporaryPassword(""); setConfirmation(""); setError(""); onOpenChange(false);
  }
  return <><Dialog open={open} onOpenChange={(value) => { if (!saving) { if (value) onOpenChange(true); else close(); } }}>
    <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto rounded-3xl text-right sm:max-w-5xl [&_[data-slot=dialog-close]]:right-auto [&_[data-slot=dialog-close]]:left-4">
      <DialogHeader className="text-right sm:text-right"><DialogTitle className="text-xl font-black">إدارة المستخدمين</DialogTitle><DialogDescription>أنشئ الحسابات وحرر أسماء المستخدمين ومناصبهم وتبعيتهم. يظهر لكل مستخدم مسؤوله المباشر والتسلسل الإداري حتى مدير النظام. كل كلمة مرور جديدة أو معاد ضبطها مؤقتة، ويجب تغييرها عند أول دخول.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-amber-800">{users.filter((u) => u.resetRequestedAt).length} طلبات إعادة ضبط معلقة</p><Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void load()}><RefreshCw />تحديث القائمة</Button></div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p className="text-sm text-slate-500">جارٍ تحميل الحسابات...</p> : <Table className="min-w-[700px] text-right [&_th]:text-right">
        <TableHeader className="bg-teal-50"><TableRow><TableHead>المستخدم</TableHead><TableHead>المسؤول المباشر</TableHead><TableHead>التسلسل الإداري والجهة</TableHead><TableHead>حالة الحساب</TableHead><TableHead>كلمة المرور</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader>
        <TableBody>{users.map((user) => <TableRow key={user.email}>
          <TableCell className="whitespace-normal"><p className="font-bold">{user.name}</p><p className="mt-1 text-xs font-bold text-teal-800">{user.position ? POSITIONS[user.position] : "يلزم تحديد المنصب"}</p><p dir="ltr" className="mt-1 text-right text-xs text-slate-500">{user.loginEmail ?? user.email}</p></TableCell>
          <TableCell className="whitespace-normal text-sm leading-6">{user.position === "system_admin" ? <span className="font-bold text-teal-800">مستقل — لا يتبع لأحد</span> : <div className="grid gap-2">{[user.managerEmail, ...(user.additionalManagerEmail ? [user.additionalManagerEmail] : [])].map((email, index) => { const manager = users.find((candidate) => candidate.email === email); const valid = Boolean(user.position && manager?.position && (index === 0 ? MANAGER_POSITIONS[user.position].includes(manager.position) : user.position === "employee" && manager.position === "department_manager")); return <div key={email ?? index} className="rounded-lg bg-sky-50/60 px-2 py-1"><p className="font-bold">{manager?.name ?? "غير محدد"}</p><p className="text-xs font-bold text-sky-800">{manager?.position ? POSITIONS[manager.position] : "منصب غير محدد"}</p>{!valid && <p className="text-xs font-semibold text-red-700">يلزم تعديل التبعية</p>}</div>; })}</div>}</TableCell>
          <TableCell className="min-w-64 whitespace-normal text-xs leading-6"><HierarchyPath users={[...supervisorChain(users, user.managerEmail), user]} />{user.additionalManagerEmail && <div className="mt-2"><p className="mb-1 font-bold text-sky-800">التبعية المباشرة لمدير الإدارة</p><HierarchyPath users={[...supervisorChain(users, user.additionalManagerEmail), user]} /></div>}<p className="mt-2 text-slate-500">الجهة: {user.position === "system_admin" ? "مستقل" : entities.find((entity) => entity.id === user.entityId)?.name ?? "غير محددة"}</p></TableCell>
          <TableCell><span className={`rounded-full px-2 py-1 text-xs font-bold ${user.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{user.active ? "نشط" : "معطل"}</span></TableCell>
          <TableCell className="whitespace-normal text-xs leading-6"><p>{user.mustChangePassword ? "يلزم تغيير كلمة المرور" : "كلمة مرور خاصة بالحساب"}</p>{user.resetRequestedAt && <p className="font-bold text-amber-800">طلب إعادة ضبط · {new Intl.DateTimeFormat("ar-SA", { dateStyle: "short" }).format(new Date(user.resetRequestedAt))}</p>}</TableCell>
          <TableCell><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={saving} onClick={() => setEditingUser({ ...user, position: user.position ?? "employee" })}>تعديل المنصب والتبعية</Button><Button variant="outline" size="sm" disabled={saving || user.email === currentEmail} onClick={() => { setResetEmail(user.email); setTemporaryPassword(""); setConfirmation(""); }}><KeyRound />إعادة ضبط</Button><Button variant="outline" size="sm" disabled={saving || user.email === currentEmail} onClick={() => void mutate("PATCH", { email: user.email, active: !user.active })}>{user.active ? "تعطيل" : "تفعيل"}</Button><Button variant="outline" size="sm" className="text-red-700" disabled={saving || user.email === currentEmail} onClick={() => setDeletingUser(user)}><Trash2 className="size-4" />حذف الحساب</Button></div></TableCell>
        </TableRow>)}</TableBody>
      </Table>}
      {editingUser && <form className="grid gap-4 rounded-2xl border border-sky-200 bg-sky-50/40 p-4" onSubmit={(event) => { event.preventDefault(); void mutate("PATCH", { email: editingUser.email, newEmail: editingUser.loginEmail, name: editingUser.name, position: editingUser.position, managerEmail: editingUser.managerEmail, additionalManagerEmail: editingUser.additionalManagerEmail, managerPosition: editingUser.managerPosition, entityId: editingUser.entityId }).then((ok) => { if (ok) { setEditingUser(null); toast.success("تم تحديث بيانات المستخدم."); } }); }}>
        <h3 className="font-black text-sky-900">تعديل المستخدم: {editingUser.loginEmail}</h3>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">اسم المستخدم<Input required maxLength={120} value={editingUser.name} onChange={(event) => setEditingUser({ ...editingUser, name: event.target.value })} /></label><label className="grid gap-2 text-sm font-bold">بريد تسجيل الدخول<Input type="email" dir="ltr" required maxLength={254} value={editingUser.loginEmail} onChange={(event) => setEditingUser({ ...editingUser, loginEmail: event.target.value })} /></label><UserHierarchyFields value={editingUser} onChange={(links) => setEditingUser({ ...editingUser, ...links })} users={users} entities={entities} disabled={saving} email={editingUser.email} lockPosition={editingUser.email === currentEmail} /></fieldset>
        <div className="flex gap-2"><Button type="submit" disabled={saving}>حفظ البيانات</Button><Button type="button" variant="outline" disabled={saving} onClick={() => setEditingUser(null)}>إلغاء</Button></div>
      </form>}
      {resetEmail && <form className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4" onSubmit={(event) => { event.preventDefault(); if (temporaryPassword !== confirmation) { setError("كلمتا المرور غير متطابقتين."); return; } void mutate("PATCH", { email: resetEmail, temporaryPassword }).then((ok) => { if (ok) { setResetEmail(""); setTemporaryPassword(""); setConfirmation(""); toast.success("تم تعيين كلمة مرور مؤقتة وإلغاء الجلسات السابقة. سلّمها لصاحب الحساب."); } }); }}>
        <h3 className="font-bold text-amber-900">إعادة ضبط كلمة مرور: <span dir="ltr">{resetEmail}</span></h3>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">كلمة المرور المؤقتة<Input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} /></label><label className="grid gap-2 text-sm font-bold">تأكيد كلمة المرور المؤقتة<Input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label></fieldset>
        <p className="text-xs leading-6 text-amber-900">سيُلزم المستخدم بتغيير هذه الكلمة عند أول دخول بعد إعادة الضبط.</p>
        <div className="flex gap-2"><Button disabled={saving} type="submit">تعيين كلمة مؤقتة</Button><Button variant="outline" type="button" disabled={saving} onClick={() => { setResetEmail(""); setTemporaryPassword(""); setConfirmation(""); }}>إلغاء</Button></div>
      </form>}
      <form onSubmit={(event) => { event.preventDefault(); if (draft.password !== draft.confirmation) { setError("كلمتا المرور غير متطابقتين."); return; } void mutate("POST", draft).then((ok) => { if (ok) { setDraft({ name: "", email: "", password: "", confirmation: "", position: "employee", managerEmail: null, additionalManagerEmail: null, managerPosition: undefined, entityId: null }); toast.success("تم إنشاء الحساب. سلّم كلمة المرور المؤقتة لصاحب الحساب."); } }); }} className="grid gap-4 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
        <h3 className="font-black text-teal-900">إنشاء حساب مستخدم</h3>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">اسم المستخدم<Input required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">البريد الإلكتروني<Input type="email" dir="ltr" autoComplete="off" required maxLength={254} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">كلمة المرور المؤقتة<Input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">تأكيد كلمة المرور<Input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={draft.confirmation} onChange={(e) => setDraft({ ...draft, confirmation: e.target.value })} /></label>
          <UserHierarchyFields value={draft} onChange={(links) => setDraft({ ...draft, ...links })} users={users} entities={entities} disabled={saving} />
        </fieldset>
        <p className="text-xs leading-6 text-slate-600">حدد المنصب والمسؤول المباشر والجهة وفق الهيكل الإداري. يُستثنى مدير النظام من الارتباط. كلمة المرور لا تقل عن 10 أحرف.</p>
        <DialogFooter><Button type="submit" disabled={saving || loading}>{saving ? <Loader2 className="animate-spin" /> : <UserPlus />}إنشاء الحساب</Button><Button type="button" variant="outline" disabled={saving} onClick={close}>إغلاق</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  <AlertDialog open={Boolean(deletingUser)} onOpenChange={(value) => { if (!saving && !value) setDeletingUser(null); }}><AlertDialogContent dir="rtl" className="rounded-2xl text-right"><AlertDialogHeader className="sm:text-right"><AlertDialogTitle>حذف حساب المستخدم</AlertDialogTitle><AlertDialogDescription>هل تريد حذف حساب «{deletingUser?.name}»؟ سيتوقف تسجيل دخوله وتُلغى جلساته. ستبقى بيانات المهام السابقة محفوظة، ويلزم نقل ارتباطات المستخدمين التابعين له قبل الحذف.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>إلغاء</AlertDialogCancel><AlertDialogAction className="bg-red-700 hover:bg-red-800" disabled={saving} onClick={(event) => { event.preventDefault(); if (deletingUser) void mutate("DELETE", { email: deletingUser.email }).then((ok) => { setDeletingUser(null); if (ok) toast.success("تم حذف الحساب."); }); }}>حذف الحساب</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
