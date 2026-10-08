"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POSITIONS, type PublicUser } from "@/lib/user-types";
export function TaskAssigneeSelect({ email, name, users, disabled, onChange, label = "المسؤول عن المهمة" }: { email?: string; name: string; users: PublicUser[]; disabled: boolean; onChange: (user: PublicUser | null) => void; label?: string }) {
  const availableUsers = users.filter((user) => user.active && user.position && user.position !== "system_admin");
  const value = email || (name ? "__legacy" : "__none");
  return <Select dir="rtl" value={value} disabled={disabled} onValueChange={(next) => onChange(availableUsers.find((user) => user.email === next) ?? null)}><SelectTrigger aria-label={label} className="data-[size=default]:h-11 w-full rounded-xl"><SelectValue placeholder="اختر المسؤول عن المهمة" /></SelectTrigger><SelectContent dir="rtl"><SelectItem value="__none">غير مسند لمستخدم</SelectItem>{availableUsers.map((user) => <SelectItem key={user.email} value={user.email}>{user.name} · {user.position ? POSITIONS[user.position] : "غير محدد"}</SelectItem>)}{email && !availableUsers.some((user) => user.email === email) && <SelectItem value={email} disabled>{name || email} · الارتباط الحالي</SelectItem>}{!email && name && <SelectItem value="__legacy" disabled>{name} · إسناد سابق</SelectItem>}</SelectContent></Select>;
}
