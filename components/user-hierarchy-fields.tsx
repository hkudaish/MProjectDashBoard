"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POSITIONS, type Entity, type Position, type PublicUser } from "@/lib/user-types";
import { HierarchyPath } from "@/components/hierarchy-path";
import { MANAGER_POSITIONS } from "@/lib/user-types";
import { managerOptions, supervisorChain } from "@/lib/hierarchy";
export type HierarchyDraft = { position: Position; managerEmail: string | null; entityId: string | null };
export function UserHierarchyFields({ value, onChange, users, entities, disabled, email = "", lockPosition = false }: { value: HierarchyDraft; onChange: (value: HierarchyDraft) => void; users: PublicUser[]; entities: Entity[]; disabled: boolean; email?: string; lockPosition?: boolean }) {
  const managers = managerOptions(users, value.position, email);
  const selectedManager = users.find((user) => user.email === value.managerEmail);
  const validManager = Boolean(selectedManager?.position && MANAGER_POSITIONS[value.position].includes(selectedManager.position) && selectedManager.active && selectedManager.email !== email);
  const visibleEntities = entities.filter((entity) => !entity.hidden && !entity.deleted);
  return <>
    <label className="grid gap-2 text-sm font-bold">المنصب<Select dir="rtl" value={value.position} disabled={disabled || lockPosition} onValueChange={(position) => onChange({ ...value, position: position as Position, managerEmail: null, entityId: position === "system_admin" ? null : value.entityId })}><SelectTrigger className="w-full rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{Object.entries(POSITIONS).map(([position, name]) => <SelectItem key={position} value={position}>{name}</SelectItem>)}</SelectContent></Select></label>
    {value.position === "system_admin" ? <p className="self-center text-sm text-teal-800">مدير النظام مستقل، ولا يرتبط بجهة أو مسؤول مباشر.</p> : <>
      <label className="grid gap-2 text-sm font-bold">المسؤول المباشر<Select dir="rtl" value={value.managerEmail ?? ""} disabled={disabled} onValueChange={(managerEmail) => onChange({ ...value, managerEmail })}><SelectTrigger className="w-full rounded-xl text-right"><SelectValue placeholder="اختر المسؤول المباشر (الاسم والمنصب)" /></SelectTrigger><SelectContent dir="rtl">{managers.map((manager) => <SelectItem key={manager.email} value={manager.email}>{manager.name} · {POSITIONS[manager.position!]}</SelectItem>)}{value.managerEmail && !managers.some((manager) => manager.email === value.managerEmail) && <SelectItem value={value.managerEmail} disabled>{selectedManager?.name ?? value.managerEmail} {selectedManager?.position && `· ${POSITIONS[selectedManager.position]}`} · يلزم تعديل الارتباط</SelectItem>}</SelectContent></Select>{!managers.length && <span className="text-xs font-normal text-amber-800">أضف مسؤولًا بالمنصب الأعلى المناسب أولًا.</span>}</label>
      <label className="grid gap-2 text-sm font-bold">الجهة التابع لها<Select dir="rtl" value={value.entityId ?? ""} disabled={disabled} onValueChange={(entityId) => onChange({ ...value, entityId })}><SelectTrigger className="w-full rounded-xl text-right"><SelectValue placeholder="اختر الجهة" /></SelectTrigger><SelectContent dir="rtl">{visibleEntities.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>)}{value.entityId && !visibleEntities.some((entity) => entity.id === value.entityId) && <SelectItem value={value.entityId} disabled>{entities.find((entity) => entity.id === value.entityId)?.name ?? "جهة غير متاحة"} · محجوبة</SelectItem>}</SelectContent></Select></label>
      <div className="grid gap-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3 sm:col-span-2">
        <p className="text-xs font-bold text-sky-900">التسلسل الإداري حتى المسؤول المباشر</p>
        {value.position === "employee" && <p className="text-xs leading-6 text-slate-600">يتبع الموظف رئيس القسم مباشرةً، ومنه مدير الإدارة، أو مدير الإدارة مباشرةً عند عدم ارتباطه بقسم.</p>}
        {selectedManager ? <><HierarchyPath users={supervisorChain(users, value.managerEmail)} />{!validManager && <p role="alert" className="text-xs font-semibold text-red-700">الارتباط الحالي لا يتوافق مع المنصب. اختر مسؤولًا مباشرًا من الخيارات المعتمدة.</p>}</> : <p className="text-xs text-slate-500">اختر المسؤول المباشر لإظهار التسلسل الإداري.</p>}
      </div>
    </>}
  </>;
}
