"use client";

import { Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OWNER_LABELS, STATUS_LABELS, type TaskDetail, type TaskStatus } from "@/lib/types";

export function TaskDetailsEditor({ details, onChange, disabled }: {
  details: TaskDetail[];
  onChange: (details: TaskDetail[]) => void;
  disabled: boolean;
}) {
  function updateDetail(id: string, patch: Partial<TaskDetail>) {
    onChange(details.map((detail) => detail.id === id ? { ...detail, ...patch } : detail));
  }

  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 p-4">
      <legend className="px-2 text-sm font-bold">تفاصيل المهمة</legend>
      {details.length === 0 && <p className="text-sm leading-6 text-slate-500">يمكن إضافة أكثر من مهمة تفصيلية تحت هذا العنوان.</p>}
      {details.map((detail, index) => (
        <div key={detail.id} className="grid min-w-0 gap-4 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-[#116d7b]">المهمة التفصيلية {index + 1}</span>
            <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`حذف المهمة التفصيلية ${index + 1}`} className="rounded-xl text-slate-500 hover:text-red-700" onClick={() => onChange(details.filter((item) => item.id !== detail.id))}><Trash2 className="size-4" /></Button>
          </div>
          <label className="grid gap-2 text-sm font-bold">وصف المهمة<Textarea value={detail.description} maxLength={1200} onChange={(event) => updateDetail(detail.id, { description: event.target.value })} placeholder="اكتب وصف المهمة التفصيلية" className="min-h-24 rounded-xl text-base leading-7" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold">حالة الإنجاز<Select dir="rtl" disabled={disabled} value={detail.status} onValueChange={(value) => updateDetail(detail.id, { status: value as TaskStatus })}><SelectTrigger className="h-11 w-full rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
            <label className="grid gap-2 text-sm font-bold">تاريخ الإنجاز<Input type="date" value={detail.completionDate} onChange={(event) => updateDetail(detail.id, { completionDate: event.target.value })} className="h-11 rounded-xl" /></label>
          </div>
          <label className="grid gap-2 text-sm font-bold">الجهة<Select dir="rtl" disabled={disabled} value={detail.ownerType} onValueChange={(value) => updateDetail(detail.id, { ownerType: value })}><SelectTrigger className="h-11 w-full rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{Object.entries(OWNER_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
          <label className="grid gap-2 text-sm font-bold">المسؤول المباشر<div className="relative"><UserRound className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={detail.assignee} maxLength={120} onChange={(event) => updateDetail(detail.id, { assignee: event.target.value })} placeholder="اكتب اسم الشخص المسؤول" className="h-11 rounded-xl pr-10" /></div></label>
        </div>
      ))}
      <Button type="button" variant="outline" disabled={disabled} className="h-11 justify-self-start rounded-xl text-[#116d7b]" onClick={() => onChange([...details, { id: crypto.randomUUID(), description: "", status: "not_started", completionDate: "", ownerType: "unassigned", assignee: "" }])}><Plus className="size-4" />إضافة مهمة تفصيلية</Button>
    </fieldset>
  );
}