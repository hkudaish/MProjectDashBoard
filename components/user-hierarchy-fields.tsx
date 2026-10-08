"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POSITIONS, type Entity, type Position, type PublicUser } from "@/lib/user-types";
import { managerOptions } from "@/lib/hierarchy";
export type HierarchyDraft = { position: Position; managerEmail: string | null; entityId: string | null };
export function UserHierarchyFields({ value, onChange, users, entities, disabled, email = "", lockPosition = false }: { value: HierarchyDraft; onChange: (value: HierarchyDraft) => void; users: PublicUser[]; entities: Entity[]; disabled: boolean; email?: string; lockPosition?: boolean }) {
  const managers = managerOptions(users, value.position, email);
  const visibleEntities = entities.filter((entity) => !entity.hidden && !entity.deleted);
  return <>
    <label className="grid gap-2 text-sm font-bold">المنصب<Select dir="rtl" value={value.position} disabled={disabled || lockPosition} onValueChange={(position) => onChange({ ...value, position: position as Position, managerEmail: null, entityId: position === "system_admin" ? null : value.entityId })}><SelectTrigger className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{Object.entries(POSITIONS).map(([position, name]) => <SelectItem key={position} value={position}>{name}</SelectItem>)}</SelectContent></Select></label>
    {value.position === "system_admin" ? <p className="self-center text-sm text-teal-800">مدير النظام مستقل، ولا يرتبط بجهة أو مسؤول مباشر.</p> : <>
      <label className="grid gap-2 text-sm font-bold">المسؤول المباشر<Select dir="rtl" value={value.managerEmail ?? ""} disabled={disabled} onValueChange={(managerEmail) => onChange({ ...value, managerEmail })}><SelectTrigger className="w-full rounded-xl"><SelectValue placeholder="اختر المسؤول المباشر" /></SelectTrigger><SelectContent dir="rtl">{managers.map((manager) => <SelectItem key={manager.email} value={manager.email}>{manager.name} · {POSITIONS[manager.position!]}</SelectItem>)}{value.managerEmail && !managers.some((manager) => manager.email === value.managerEmail) && <SelectItem value={value.managerEmail} disabled>{users.find((user) => user.email === value.managerEmail)?.name ?? value.managerEmail} · يلزم تعديل الارتباط</SelectItem>}</SelectContent></Select>{!managers.length && <span className="text-xs font-normal text-amber-800">أضف مسؤولًا بالمنصب الأعلى المناسب أولًا.</span>}</label>
      <label className="grid gap-2 text-sm font-bold">الجهة التابع لها<Select dir="rtl" value={value.entityId ?? ""} disabled={disabled} onValueChange={(entityId) => onChange({ ...value, entityId })}><SelectTrigger className="w-full rounded-xl"><SelectValue placeholder="اختر الجهة" /></SelectTrigger><SelectContent dir="rtl">{visibleEntities.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>)}{value.entityId && !visibleEntities.some((entity) => entity.id === value.entityId) && <SelectItem value={value.entityId} disabled>{entities.find((entity) => entity.id === value.entityId)?.name ?? "جهة غير متاحة"} · محجوبة</SelectItem>}</SelectContent></Select></label>
    </>}
  </>;
}
