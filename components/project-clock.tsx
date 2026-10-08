"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
const zone = { timeZone: "Asia/Riyadh" };
export function ProjectClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []);
  return <section aria-label="تاريخ اليوم والوقت" className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-teal-100 bg-white px-4 py-3 shadow-sm sm:px-5">
    <div className="flex items-center gap-2 font-bold text-teal-900"><CalendarDays className="size-4 text-teal-700" /><span>{now ? new Intl.DateTimeFormat("ar-SA", { ...zone, weekday: "long" }).format(now) : "اليوم"}</span></div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
      <span><span className="ml-2 text-xs text-slate-400">هجري</span>{now ? new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { ...zone, day: "numeric", month: "long", year: "numeric" }).format(now) : "—"}</span>
      <span><span className="ml-2 text-xs text-slate-400">ميلادي</span>{now ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { ...zone, day: "numeric", month: "long", year: "numeric" }).format(now) : "—"}</span>
    </div>
    <div className="mr-auto flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-1.5 text-teal-800"><Clock3 className="size-4" /><time aria-label="الوقت بتوقيت الرياض" dateTime={now?.toISOString()} dir="ltr" className="min-w-[78px] text-center font-bold tabular-nums">{now ? new Intl.DateTimeFormat("en-GB", { ...zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now) : "--:--:--"}</time><span className="hidden text-xs sm:inline">بتوقيت الرياض</span></div>
  </section>;
}
