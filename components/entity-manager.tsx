"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Entity } from "@/lib/user-types";
export function EntityManager({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [draft, setDraft] = useState({ id: "", name: "", description: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async () => { try { const response = await fetch("/api/entities", { cache: "no-store" }); const data = await response.json() as { entities: Entity[]; error?: string }; if (!response.ok) throw new Error(data.error); setEntities(data.entities); } catch { setError("تعذر تحميل الجهات."); } }, []);
  useEffect(() => { if (!open) return; const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [open, load]);
  async function mutate(method: string, payload: object) {
    setBusy(true); setError("");
    try { const response = await fetch("/api/entities", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "تعذر حفظ الجهة."); await load(); onChanged(); return true; }
    catch (error) { setError(error instanceof Error ? error.message : "تعذر حفظ الجهة."); return false; } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) { onOpenChange(value); if (!value) { setDraft({ id: "", name: "", description: "" }); setError(""); } } }}><DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto rounded-3xl text-right sm:max-w-3xl"><DialogHeader className="text-right sm:text-right"><DialogTitle>إدارة الجهات</DialogTitle><DialogDescription>أضف الجهات المسؤولة عن المشاريع والمستخدمين. الحجب يمنع الاختيارات الجديدة ويحفظ الارتباطات القائمة. الحذف متاح للجهات غير المرتبطة ببيانات.</DialogDescription></DialogHeader>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="grid gap-3">{entities.map((entity) => <div key={entity.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-bold">{entity.name} {entity.hidden && <span className="text-xs text-amber-800">· محجوبة</span>}</p><p className="text-xs leading-6 text-slate-500">{entity.description}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => setDraft({ id: entity.id, name: entity.name, description: entity.description })}>تعديل</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => void mutate("PATCH", { id: entity.id, hidden: !entity.hidden })}>{entity.hidden ? "إظهار" : "حجب"}</Button><Button variant="outline" size="sm" className="text-red-800" disabled={busy} onClick={() => void mutate("DELETE", { id: entity.id })}>حذف</Button></div></div>)}</div>
    <form className="grid gap-4 rounded-2xl border border-teal-200 bg-teal-50/40 p-4" onSubmit={(event) => { event.preventDefault(); void mutate(draft.id ? "PATCH" : "POST", draft).then((ok) => { if (ok) setDraft({ id: "", name: "", description: "" }); }); }}><h3 className="font-black text-teal-900">{draft.id ? "تعديل الجهة" : "إضافة جهة"}</h3><fieldset disabled={busy} className="grid gap-4"><label className="grid gap-2 text-sm font-bold">اسم الجهة<Input required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="grid gap-2 text-sm font-bold">وصف الجهة<Textarea maxLength={1200} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></fieldset><div className="flex gap-2"><Button disabled={busy} type="submit">{draft.id ? "حفظ التعديلات" : "إضافة الجهة"}</Button>{draft.id && <Button variant="outline" type="button" disabled={busy} onClick={() => setDraft({ id: "", name: "", description: "" })}>إلغاء التعديل</Button>}</div></form>
  </DialogContent></Dialog>;
}
