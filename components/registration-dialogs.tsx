"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pause, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { REGISTRATION_LABELS, type RegistrationRequest, type RegistrationStatus } from "@/lib/registration-types";
import type { Project } from "@/lib/types";
import type { Entity } from "@/lib/user-types";

export function useRegistrationCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/registration-requests", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { requests: RegistrationRequest[] };
        if (!cancelled) setCount(data.requests.filter(item => item.status === "pending" || item.status === "on_hold").length);
      } catch { /* The next refresh will retry. */ }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled]);
  return enabled ? count : 0;
}

export function RegistrationRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState({ name: "", jobTitle: "", department: "", email: "", entityId: "", projectId: "" });
  const [entities, setEntities] = useState<Entity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [entityError, setEntityError] = useState("");
  const [reloadEntities, setReloadEntities] = useState(0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingEntities(true); setEntityError("");
      try {
        const [response, projectResponse] = await Promise.all([fetch("/api/entities", { cache: "no-store" }), fetch("/api/projects", { cache: "no-store" })]);
        const data = await response.json() as { entities: Entity[]; error?: string };
        if (!response.ok) throw new Error(data.error || "تعذر تحميل الجهات.");
        const projectData = await projectResponse.json() as { projects: Project[]; error?: string };
        if (!projectResponse.ok) throw new Error(projectData.error || "تعذر تحميل المشاريع.");
        if (!cancelled) { setEntities(data.entities.filter(entity => !entity.hidden && !entity.deleted)); setProjects(projectData.projects); }
      } catch (error) { if (!cancelled) { setEntities([]); setProjects([]); setEntityError(error instanceof Error ? error.message : "تعذر تحميل الجهات."); } }
      finally { if (!cancelled) setLoadingEntities(false); }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, reloadEntities]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function changeOpen(value: boolean) { if (!saving) { setError(""); setMessage(""); onOpenChange(value); } }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/registration-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { message: string; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر إرسال الطلب.");
      setMessage(data.message); setForm({ name: "", jobTitle: "", department: "", email: "", entityId: "", projectId: "" });
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر إرسال الطلب."); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent dir="rtl" className="rounded-3xl text-right sm:max-w-lg">
      <DialogHeader className="sm:text-right"><DialogTitle>طلب تسجيل</DialogTitle><DialogDescription>مرحبًا بك! يسعدنا انضمامك. أكمل بياناتك لإرسال طلب التسجيل إلى مدير النظام للمراجعة والاعتماد.</DialogDescription></DialogHeader>
      {message ? <><p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm leading-7 text-emerald-800">{message}</p><Button onClick={() => changeOpen(false)}>إغلاق</Button></> : <form onSubmit={submit} className="grid gap-4">
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">الاسم<Input required maxLength={120} autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">المسمى الوظيفي<Input required maxLength={120} placeholder="موظف / رئيس قسم / مدير إدارة / مدير مشروع" value={form.jobTitle} onChange={event => setForm({ ...form, jobTitle: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">اسم المشروع<select required aria-label="اسم المشروع" value={form.projectId} disabled={loadingEntities || Boolean(entityError)} onChange={event => setForm({ ...form, projectId: event.target.value })} className="h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm font-normal shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="" disabled>{loadingEntities ? "جارٍ تحميل المشاريع…" : "اختر المشروع الذي تعمل له"}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="grid gap-2 text-sm font-bold">اسم الجهة<select required aria-label="اسم الجهة" value={form.entityId} disabled={loadingEntities || Boolean(entityError)} onChange={event => setForm({ ...form, entityId: event.target.value })} className="h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm font-normal shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="" disabled>{loadingEntities ? "جارٍ تحميل الجهات…" : "اختر الجهة التي تعمل لها"}</option>{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-bold">الإدارة<Input required maxLength={120} autoComplete="organization" value={form.department} onChange={event => setForm({ ...form, department: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">البريد الإلكتروني<Input type="email" dir="ltr" required maxLength={254} autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
        </fieldset>
        {entityError && <div role="alert" className="flex items-center justify-between gap-2 text-sm text-red-700"><span>{entityError}</span><Button type="button" variant="outline" disabled={saving || loadingEntities} onClick={() => setReloadEntities(value => value + 1)}>إعادة المحاولة</Button></div>}
        {!loadingEntities && !entityError && entities.length === 0 && <p role="status" className="text-sm text-amber-800">لا توجد جهات متاحة. تواصل مع مدير النظام لإضافة الجهة.</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <DialogFooter><Button type="submit" disabled={saving || loadingEntities || Boolean(entityError) || !entities.some(entity => entity.id === form.entityId) || !projects.some(project => project.id === form.projectId)}>{saving && <Loader2 className="size-4 animate-spin" />}إرسال الطلب</Button><Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>إلغاء</Button></DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}

const colors: Record<RegistrationStatus, string> = { pending: "bg-amber-50 text-amber-800", approved: "bg-sky-50 text-sky-800", rejected: "bg-red-50 text-red-800", on_hold: "bg-violet-50 text-violet-800", activated: "bg-emerald-50 text-emerald-800" };
export function RegistrationReviewDialog({ open, onOpenChange, onApproved }: { open: boolean; onOpenChange: (open: boolean) => void; onApproved: (request: RegistrationRequest) => void }) {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [configured, setConfigured] = useState(false);
  const [mailMode, setMailMode] = useState<"unconfigured" | "test" | "live">("unconfigured");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/registration-requests", { cache: "no-store" }); const data = await response.json() as { requests: RegistrationRequest[]; mailConfigured: boolean; mailMode: "unconfigured" | "test" | "live"; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الطلبات.");
      setRequests(data.requests); setConfigured(data.mailConfigured); setMailMode(data.mailMode);
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر تحميل الطلبات."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); } }, [open, load]);
  async function review(request: RegistrationRequest, status: "approved" | "rejected" | "on_hold") {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/registration-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: request.id, status, note: notes[request.id] ?? request.note }) });
      const data = await response.json() as { request: RegistrationRequest; error?: string }; if (!response.ok) throw new Error(data.error || "تعذر حفظ القرار.");
      await load(); toast.success("تم حفظ قرار المراجعة.");
      if (status === "approved") { onOpenChange(false); onApproved(data.request); }
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر حفظ القرار."); }
    finally { setSaving(false); }
  }
  async function retryMail() {
    setSaving(true); setError("");
    try { const response = await fetch("/api/registration-requests", { method: "PUT" }); if (!response.ok) throw new Error("تعذر إعادة إرسال الإشعارات."); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "تعذر إعادة الإرسال."); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!saving) onOpenChange(value); }}><DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto rounded-3xl text-right sm:max-w-3xl">
    <DialogHeader className="sm:text-right"><DialogTitle>طلبات التسجيل</DialogTitle><DialogDescription>راجع بيانات المتقدمين. الموافقة تفتح نموذج المستخدمين لاستكمال المنصب والتبعية وكلمة المرور المؤقتة، ثم تفعيل الحساب.</DialogDescription></DialogHeader>
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void load()}><RefreshCw className="size-4" />تحديث الطلبات</Button><Button variant="outline" size="sm" disabled={!configured || loading || saving} onClick={() => void retryMail()}>إعادة إرسال الإشعارات المعلقة</Button></div>
    {!configured && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">إرسال البريد غير مهيأ بعد. الطلبات والقرارات محفوظة، والإشعارات تنتظر ربط خدمة البريد.</p>}
    {mailMode === "test" && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm leading-7 text-amber-900">خدمة البريد متصلة بوضع التجربة. عنوان resend.dev يرسل إلى بريد صاحب حساب Resend فقط؛ لإرسال الإشعارات إلى المتقدمين، يجب استخدام عنوان مرسل على نطاق موثّق.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading && <p className="text-sm text-slate-500">جارٍ تحميل الطلبات…</p>}
    {!loading && requests.length === 0 && <p className="rounded-xl bg-slate-50 p-6 text-center text-slate-500">لا توجد طلبات تسجيل حتى الآن.</p>}
    {[...requests].reverse().map(request => <article key={request.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">{request.name}</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${colors[request.status]}`}>{REGISTRATION_LABELS[request.status]}</span></div>
      <p className="text-sm"><span className="text-slate-500">اسم المشروع: </span><span className="font-semibold">{request.projectName || "غير محدد — طلب سابق"}</span></p><p className="text-sm"><span className="text-slate-500">اسم الجهة: </span><span className="font-semibold">{request.entityName || "غير محددة — طلب سابق"}</span></p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">المسمى الوظيفي</dt><dd>{request.jobTitle}</dd></div><div><dt className="text-xs text-slate-500">الإدارة</dt><dd>{request.department}</dd></div><div><dt className="text-xs text-slate-500">البريد الإلكتروني</dt><dd dir="ltr" className="break-all text-right">{request.email}</dd></div><div><dt className="text-xs text-slate-500">تاريخ الطلب</dt><dd>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(request.createdAt))}</dd></div></dl>
      <p className="text-xs text-slate-500">إشعارات البريد: {request.notifications.filter(item => item.status === "sent").length} مُرسلة · {request.notifications.filter(item => item.status === "queued").length} بانتظار الإرسال · {request.notifications.filter(item => item.status === "failed").length} تعذر إرسالها</p>
      {request.status !== "activated" && <><label className="grid gap-1 text-sm">ملاحظات المراجعة<Textarea disabled={saving} maxLength={2000} value={notes[request.id] ?? request.note} onChange={event => setNotes({ ...notes, [request.id]: event.target.value })} placeholder="سبب الرفض أو البيانات المطلوبة لاستكمال المراجعة" /></label><div className="flex flex-wrap gap-2"><Button disabled={saving} onClick={() => void review(request, "approved")}><Check className="size-4" />{request.status === "approved" ? "استكمال الاعتماد" : "موافقة"}</Button><Button variant="outline" className="border-red-200 text-red-700" disabled={saving} onClick={() => void review(request, "rejected")}><X className="size-4" />رفض</Button><Button variant="outline" className="border-violet-200 text-violet-700" disabled={saving} onClick={() => void review(request, "on_hold")}><Pause className="size-4" />تعليق</Button></div></>}
    </article>)}
  </DialogContent></Dialog>;
}
