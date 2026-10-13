"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TaskDetailsEditor } from "@/components/task-details-editor";
import { useSettingsWorkspace } from "@/components/settings-workspace";
import { projectInputSchema } from "@/lib/projects";
import { productInputSchema } from "@/lib/products";
import { OWNER_LABELS, type TaskDetail } from "@/lib/types";
export function SettingsCreateForm({ product = false }: { product?: boolean }) {
  const { projects, entities, users, projectId, setProjectId, reloadCatalog } = useSettingsWorkspace();
  const router = useRouter();
  const [name, setName] = useState(""), [description, setDescription] = useState(""), [target, setTarget] = useState(""), [entityIds, setEntityIds] = useState<string[]>([]), [details, setDetails] = useState<TaskDetail[]>([]), [detailsVersion, setDetailsVersion] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const availableEntities = entities.filter(entity => !entity.hidden && !entity.deleted);
  const ownerLabels = { unassigned: OWNER_LABELS.unassigned, joint: OWNER_LABELS.joint, ...Object.fromEntries(availableEntities.map(entity => [entity.id, entity.name])) };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const parsed = product ? productInputSchema.safeParse({ name, description, target, projectId, details }) : projectInputSchema.safeParse({ name, description, entityIds });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "راجع البيانات."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/${product ? "products" : "projects"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data = await response.json() as { project?: { id: string }; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر الحفظ.");
      if (data.project) setProjectId(data.project.id);
      await reloadCatalog(); setName(""); setDescription(""); setTarget(""); setEntityIds([]); setDetails([]); setDetailsVersion(version => version + 1);
      toast.success(product ? "تمت إضافة المنتج. يمكنك إضافة مهامه من لوحة المعلومات." : "تمت إضافة المشروع. يمكنك الآن إضافة منتجاته.");
      if (data.project) router.push(`/settings/products?project=${encodeURIComponent(data.project.id)}`);
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر الحفظ."); } finally { setBusy(false); }
  }
  return <form onSubmit={event => void submit(event)} className="grid min-w-0 gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><fieldset disabled={busy} className="grid min-w-0 gap-5 [&_label]:min-w-0">{product && <label className="grid gap-2 text-sm font-bold">المشروع<select aria-label="المشروع" required value={projectId} onChange={event => setProjectId(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border bg-background px-3"><option value="" disabled>اختر المشروع</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}<label className="grid gap-2 text-sm font-bold">{product ? "اسم المنتج" : "اسم المشروع"}<Input required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>{product && <label className="grid gap-2 text-sm font-bold">العدد المستهدف<Input value={target} maxLength={120} placeholder="مثال: 40 منشورًا" onChange={event => setTarget(event.target.value)} /></label>}<label className="grid gap-2 text-sm font-bold">{product ? "وصف المنتج" : "وصف المشروع"}<Textarea maxLength={1200} rows={3} value={description} onChange={event => setDescription(event.target.value)} className="min-h-24 resize-y rounded-xl" /></label>{!product && <div><p className="mb-3 text-sm font-bold">الجهات المسؤولة عن المشروع</p><div className="flex flex-wrap gap-2">{availableEntities.map(entity => <label key={entity.id} className="flex items-center gap-2 rounded-xl border border-teal-100 bg-teal-50/50 px-3 py-2 text-sm"><input type="checkbox" className="accent-teal-700" checked={entityIds.includes(entity.id)} onChange={event => setEntityIds(current => event.target.checked ? [...current, entity.id] : current.filter(id => id !== entity.id))} />{entity.name}</label>)}</div>{!availableEntities.length && <p className="text-sm text-slate-500">يمكن إضافة جهات من صفحة إدارة الجهات.</p>}</div>}{product && <TaskDetailsEditor key={detailsVersion} details={details} onChange={setDetails} disabled={busy} label="تفاصيل المنتج" users={users} ownerLabels={ownerLabels} />}</fieldset>{error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{product && !projects.length && <p className="text-sm text-amber-800">أضف مشروعًا أولًا قبل إضافة منتجاته.</p>}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || product && !projectId} className="bg-teal-700 hover:bg-teal-800">{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{product ? "إضافة المنتج" : "إضافة المشروع"}</Button><Button variant="outline" asChild><Link href={`/${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`}>العودة إلى لوحة المعلومات</Link></Button></div></form>;
}
