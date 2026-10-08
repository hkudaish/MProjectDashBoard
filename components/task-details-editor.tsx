"use client";

import { Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200">
        <Table dir="rtl" aria-label="تفاصيل المهمة" className="min-w-[1000px] text-right">
          <TableHeader className="bg-slate-50/60">
            <TableRow>
              <TableHead scope="col" className="w-12 text-center font-bold">م</TableHead>
              <TableHead scope="col" className="min-w-60 text-right font-bold">وصف المهمة</TableHead>
              <TableHead scope="col" className="min-w-36 text-right font-bold">حالة الإنجاز</TableHead>
              <TableHead scope="col" className="min-w-40 text-right font-bold">تاريخ الإنجاز</TableHead>
              <TableHead scope="col" className="min-w-40 text-right font-bold">الجهة</TableHead>
              <TableHead scope="col" className="min-w-44 text-right font-bold">المسؤول المباشر</TableHead>
              <TableHead scope="col" className="w-12 text-center font-bold">حذف</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {details.length === 0 && <TableRow><TableCell colSpan={7} className="whitespace-normal py-6 text-right leading-6 text-slate-500">يمكن إضافة أكثر من مهمة تفصيلية تحت هذا العنوان.</TableCell></TableRow>}
            {details.map((detail, index) => (
              <TableRow key={detail.id}>
                <TableCell className="text-center font-bold text-[#116d7b]">{index + 1}</TableCell>
                <TableCell><Textarea aria-label={`وصف المهمة التفصيلية ${index + 1}`} value={detail.description} maxLength={1200} onChange={(event) => updateDetail(detail.id, { description: event.target.value })} placeholder="اكتب وصف المهمة" className="min-h-20 rounded-xl text-sm leading-6" /></TableCell>
                <TableCell><Select dir="rtl" disabled={disabled} value={detail.status} onValueChange={(value) => updateDetail(detail.id, { status: value as TaskStatus })}><SelectTrigger aria-label={`حالة إنجاز المهمة التفصيلية ${index + 1}`} className="h-11 w-full rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></TableCell>
                <TableCell><Input type="date" dir="ltr" aria-label={`تاريخ إنجاز المهمة التفصيلية ${index + 1}`} value={detail.completionDate} onChange={(event) => updateDetail(detail.id, { completionDate: event.target.value })} className="h-11 rounded-xl" /></TableCell>
                <TableCell><Select dir="rtl" disabled={disabled} value={detail.ownerType} onValueChange={(value) => updateDetail(detail.id, { ownerType: value })}><SelectTrigger aria-label={`جهة المهمة التفصيلية ${index + 1}`} className="h-11 w-full rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{Object.entries(OWNER_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></TableCell>
                <TableCell><div className="relative"><UserRound className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input aria-label={`المسؤول المباشر عن المهمة التفصيلية ${index + 1}`} value={detail.assignee} maxLength={120} onChange={(event) => updateDetail(detail.id, { assignee: event.target.value })} placeholder="اسم الشخص المسؤول" className="h-11 rounded-xl pr-10" /></div></TableCell>
                <TableCell><Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`حذف المهمة التفصيلية ${index + 1}`} className="rounded-xl text-slate-500 hover:text-red-700" onClick={() => onChange(details.filter((item) => item.id !== detail.id))}><Trash2 className="size-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs leading-5 text-slate-500">يمكن تمرير الجدول أفقيًا لعرض جميع التفاصيل.</p>
      <Button type="button" variant="outline" disabled={disabled} className="h-11 justify-self-start rounded-xl text-[#116d7b]" onClick={() => onChange([...details, { id: crypto.randomUUID(), description: "", status: "not_started", completionDate: "", ownerType: "unassigned", assignee: "" }])}><Plus className="size-4" />إضافة مهمة تفصيلية</Button>
    </fieldset>
  );
}