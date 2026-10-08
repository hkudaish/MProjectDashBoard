import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { progressForStatus } from "@/lib/task-progress";
import { STATUS_COLORS } from "@/lib/task-theme";
import { OWNER_LABELS, STATUS_LABELS, type Task } from "@/lib/types";

export function TaskDetailsReport({ task, label = "تفاصيل المهمة", ownerLabels = OWNER_LABELS }: { task: Pick<Task, "title" | "details">; label?: string; ownerLabels?: Record<string, string> }) {
  if (!task.details?.length) return null;

  return (
    <section aria-label={label} className="mt-3 min-w-0 overflow-hidden rounded-xl border border-teal-200 bg-white text-sm">
      <h4 className="border-b border-teal-900 bg-teal-800 px-3 py-3 font-black text-white">{label}</h4>
      <Table dir="rtl" aria-label={`${label}: ${task.title}`} className="min-w-[760px] text-right [&_th]:text-right [&_td]:text-right">
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="w-10 border-b-2 border-slate-300 bg-slate-100 px-3 font-bold text-slate-900">م</TableHead>
            <TableHead scope="col" className="min-w-48 border-b-2 border-teal-300 bg-teal-100 px-3 font-bold text-teal-900">وصف المهمة</TableHead>
            <TableHead scope="col" className="min-w-36 border-b-2 border-emerald-300 bg-emerald-100 px-3 font-bold text-emerald-900">حالة الإنجاز</TableHead>
            <TableHead scope="col" className="min-w-36 border-b-2 border-sky-300 bg-sky-100 px-3 font-bold text-sky-900">تاريخ الإنجاز</TableHead>
            <TableHead scope="col" className="min-w-36 border-b-2 border-violet-300 bg-violet-100 px-3 font-bold text-violet-900">الجهة</TableHead>
            <TableHead scope="col" className="min-w-36 border-b-2 border-amber-300 bg-amber-100 px-3 font-bold text-amber-900">المسؤول عن المهمة</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {task.details.map((detail, index) => (
            <TableRow key={detail.id}>
              <TableCell className="px-3 py-3 font-bold text-[#116d7b]">{index + 1}</TableCell>
              <TableCell className="whitespace-pre-wrap break-words px-3 py-3 font-semibold leading-6 text-slate-800">{detail.description}</TableCell>
              <TableCell className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 font-bold ${STATUS_COLORS[detail.status].badge}`}>{STATUS_LABELS[detail.status]}{detail.status !== "blocked" && ` · ${progressForStatus(detail.status)}%`}</span></TableCell>
              <TableCell className="px-3 py-3 text-slate-600">{detail.completionDate ? new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${detail.completionDate}T00:00:00`)) : "غير محدد"}</TableCell>
              <TableCell className="whitespace-normal px-3 py-3 text-slate-600">{detail.ownerName ?? ownerLabels[detail.ownerType] ?? "غير محدد"}</TableCell>
              <TableCell className="whitespace-normal px-3 py-3 text-slate-600">{detail.assignee || "غير مسند لشخص"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}