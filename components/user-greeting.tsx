"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
export function UserGreeting({ name }: { name?: string | null }) {
  const [morning, setMorning] = useState<boolean | null>(null);
  useEffect(() => { const update = () => { const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(new Date())); setMorning(hour >= 5 && hour < 12); }; const start = setTimeout(update, 0); const timer = setInterval(update, 60000); return () => { clearTimeout(start); clearInterval(timer); }; }, []);
  const Icon = morning === false ? Moon : Sun;
  return <p className="flex min-w-0 items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900"><Icon className="size-4 shrink-0 text-teal-600" /><span className="min-w-0 break-words"><span className="font-medium">{morning === null ? "مرحبًا" : morning ? "صباح الخير" : "مساء الخير"}</span>{name ? <>، <strong className="font-bold">{name}</strong></> : "، أهلاً بك"}</span></p>;
}
