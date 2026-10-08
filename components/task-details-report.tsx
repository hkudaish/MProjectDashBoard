import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { progressForStatus } from "@/lib/task-progress";
import { STATUS_COLORS } from "@/lib/task-theme";
import { OWNER_LABELS, STATUS_LABELS, type Task } from "@/lib/types";

export function TaskDetailsReport({ task }: { task: Task }) {
  if (!task.details?.length) return null;

  return (
    <section aria-label="تفاصيل المهمة" className="mt-3 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
      <h4 className="border-b border-teal-100 bg-teal-50/70 px-3 py-2 font-bold text-teal-900">تفاصيل المهمة</h4>
      <Table dir="rtl" aria-label={`تفاصيل المهمة: ${task.title}`} className="min-w-[760px] text-right [&_th]:text-right [&_td]:text-right">
        <TableHeader className="bg-slate-50/70">
          <TableRow>
            <TableHead scope="col" className="w-10 px-3 font-bold">م</TableHead>
            <TableHead scope="col" className="min-w-48 px-3 font-bold">وصف المهمة</TableHead>
            <TableHead scope="col" className="min-w-36 px-3 font-bold">حالة الإنجاز</TableHead>
            <TableHead scope="col" className="min-w-36 px-3 font-bold">تاريخ الإنجاز</TableHead>
            <TableHead scope="col" className="min-w-36 px-3 font-bold">الجهة</TableHead>
            <TableHead scope="col" className="min-w-36 px-3 font-bold">المسؤول المباشر</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {task.details.map((detail, index) => (
            <TableRow key={detail.id}>
              <TableCell className="px-3 py-3 font-bold text-[#116d7b]">{index + 1}</TableCell>
              <TableCell className="whitespace-pre-wrap break-words px-3 py-3 font-semibold leading-6 text-slate-800">{detail.description}</TableCell>
              <TableCell className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 font-bold ${STATUS_COLORS[detail.status].badge}`}>{STATUS_LABELS[detail.status]}{detail.status !== "blocked" && ` · ${progressForStatus(detail.status)}%`}</span></TableCell>
              <TableCell className="px-3 py-3 text-slate-600">{detail.completionDate ? new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${detail.completionDate}T00:00:00`)) : "غير محدد"}</TableCell>
              <TableCell className="whitespace-normal px-3 py-3 text-slate-600">{OWNER_LABELS[detail.ownerType] ?? "غير محدد"}</TableCell>
              <TableCell className="whitespace-normal px-3 py-3 text-slate-600">{detail.assignee || "غير مسند لشخص"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}