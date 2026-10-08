import { progressForStatus } from "@/lib/task-progress";
import { STATUS_COLORS } from "@/lib/task-theme";
import { OWNER_LABELS, STATUS_LABELS, type Task } from "@/lib/types";

export function TaskDetailsReport({ task }: { task: Task }) {
  if (!task.details?.length) return null;

  return (
    <section aria-label="تفاصيل المهمة" className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
      <h4 className="mb-1 font-bold text-slate-700">تفاصيل المهمة</h4>
      <ol className="divide-y divide-slate-200">
        {task.details.map((detail, index) => (
          <li key={detail.id} className="py-2">
            <div className="flex items-start gap-2">
              <span className="shrink-0 font-bold text-[#116d7b]">{index + 1}.</span>
              <p className="min-w-0 whitespace-pre-wrap break-words font-semibold leading-6 text-slate-800">{detail.description}</p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 leading-6 text-slate-600">
              <span className={`inline-flex rounded-full border px-2 py-0.5 font-bold ${STATUS_COLORS[detail.status].badge}`}>{STATUS_LABELS[detail.status]}{detail.status !== "blocked" && ` · ${progressForStatus(detail.status)}%`}</span>
              <span>تاريخ الإنجاز: {detail.completionDate ? new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${detail.completionDate}T00:00:00`)) : "غير محدد"}</span>
              <span>الجهة: {OWNER_LABELS[detail.ownerType] ?? "غير محدد"}</span>
              <span>المسؤول المباشر: {detail.assignee || "غير مسند لشخص"}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}