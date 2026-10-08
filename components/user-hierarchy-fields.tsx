"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { POSITIONS, MANAGER_POSITIONS, type Entity, type Position, type PublicUser } from "@/lib/user-types";
import { HierarchyPath } from "@/components/hierarchy-path";
import { managerOptions, supervisorChain } from "@/lib/hierarchy";
export type ManagerPosition = "section_head" | "department_manager" | "both";
export type HierarchyDraft = { position: Position; managerEmail: string | null; additionalManagerEmail: string | null; managerPosition?: ManagerPosition; entityId: string | null };
export function UserHierarchyFields({ value, onChange, users, entities, disabled, email = "", lockPosition = false }: { value: HierarchyDraft; onChange: (value: HierarchyDraft) => void; users: PublicUser[]; entities: Entity[]; disabled: boolean; email?: string; lockPosition?: boolean }) {
  const selectedManager = users.find((user) => user.email === value.managerEmail);
  const employeeMode = value.managerPosition ?? (value.additionalManagerEmail ? "both" : selectedManager?.position === "department_manager" ? "department_manager" : "section_head");
  const expected = value.position === "employee" ? (employeeMode === "both" ? "section_head" : employeeMode) : MANAGER_POSITIONS[value.position][0];
  const managers = managerOptions(users, value.position, email).filter((user) => user.position === expected);
  const departments = users.filter((user) => user.email !== email && user.active && user.position === "department_manager");
  const additional = users.find((user) => user.email === value.additionalManagerEmail);
  const valid = Boolean(selectedManager?.active && selectedManager.email !== email && selectedManager.position === expected && (employeeMode !== "both" || additional?.active && additional.position === "department_manager"));
  const visibleEntities = entities.filter((entity) => !entity.hidden && !entity.deleted);
  function managerSelect(field: "managerEmail" | "additionalManagerEmail", label: string, options: PublicUser[]) {
    const selected = users.find((user) => user.email === value[field]);
    return <label className="grid gap-2 text-sm font-bold">{label}<Select dir="rtl" required value={value[field] ?? ""} disabled={disabled} onValueChange={(managerEmail) => onChange({ ...value, [field]: managerEmail })}><SelectTrigger className="w-full rounded-xl text-right"><SelectValue placeholder="اختر الاسم والمنصب" /></SelectTrigger><SelectContent dir="rtl">{options.map((manager) => <SelectItem key={manager.email} value={manager.email}>{manager.name} · {POSITIONS[manager.position!]}</SelectItem>)}{value[field] && !options.some((manager) => manager.email === value[field]) && <SelectItem value={value[field]!} disabled>{selected?.name ?? value[field]} {selected?.position && `· ${POSITIONS[selected.position]}`} · يلزم تعديل التبعية</SelectItem>}</SelectContent></Select>{!options.length && <span className="text-xs font-normal text-amber-800">أضف مستخدمًا بالمنصب المطلوب أولًا.</span>}</label>;
  }
  return <>
    <label className="grid gap-2 text-sm font-bold">منصب المستخدم<Select dir="rtl" value={value.position} disabled={disabled || lockPosition} onValueChange={(position) => onChange({ ...value, position: position as Position, managerEmail: null, additionalManagerEmail: null, managerPosition: undefined, entityId: position === "system_admin" ? null : value.entityId })}><SelectTrigger className="w-full rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{Object.entries(POSITIONS).map(([position, name]) => <SelectItem key={position} value={position}>{name}</SelectItem>)}</SelectContent></Select></label>
    <label className="grid gap-2 text-sm font-bold">منصب المسؤول المباشر{value.position === "employee" ? <Select dir="rtl" value={employeeMode} disabled={disabled} onValueChange={(mode) => onChange({ ...value, managerPosition: mode as ManagerPosition, managerEmail: null, additionalManagerEmail: null })}><SelectTrigger className="w-full rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl"><SelectItem value="section_head">رئيس القسم</SelectItem><SelectItem value="department_manager">مدير الإدارة</SelectItem><SelectItem value="both">رئيس القسم ومدير الإدارة (كلاهما)</SelectItem></SelectContent></Select> : <Input readOnly aria-label="منصب المسؤول المباشر" className="rounded-xl bg-slate-50 text-teal-900" value={value.position === "system_admin" ? "مستقل — لا يتبع لأحد" : POSITIONS[expected]} />}</label>
    {value.position !== "system_admin" && <>
      {managerSelect("managerEmail", value.position === "employee" && employeeMode === "both" ? "رئيس القسم المسؤول" : "اسم المسؤول المباشر", managers)}
      {value.position === "employee" && employeeMode === "both" && managerSelect("additionalManagerEmail", "مدير الإدارة المسؤول", departments)}
      <label className="grid gap-2 text-sm font-bold">الجهة التابع لها<Select dir="rtl" required value={value.entityId ?? ""} disabled={disabled} onValueChange={(entityId) => onChange({ ...value, entityId })}><SelectTrigger className="w-full rounded-xl text-right"><SelectValue placeholder="اختر الجهة" /></SelectTrigger><SelectContent dir="rtl">{visibleEntities.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>)}{value.entityId && !visibleEntities.some((entity) => entity.id === value.entityId) && <SelectItem value={value.entityId} disabled>{entities.find((entity) => entity.id === value.entityId)?.name ?? "جهة غير متاحة"} · محجوبة</SelectItem>}</SelectContent></Select></label>
      <div className="grid gap-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3 sm:col-span-2"><p className="text-xs font-bold text-sky-900">التسلسل الإداري حتى المسؤول المباشر</p>
        {selectedManager ? <><HierarchyPath users={supervisorChain(users, value.managerEmail)} />{value.position === "employee" && employeeMode === "both" && <><p className="text-xs font-bold text-sky-900">التبعية المباشرة لمدير الإدارة</p>{additional ? <HierarchyPath users={supervisorChain(users, value.additionalManagerEmail)} /> : <p className="text-xs text-slate-500">اختر مدير الإدارة المسؤول.</p>}</>}{!valid && <p role="alert" className="text-xs font-semibold text-red-700">اختر المسؤولين بالمناصب المطلوبة لإكمال التبعية.</p>}</> : <p className="text-xs text-slate-500">اختر المسؤول المباشر لإظهار التسلسل الإداري.</p>}
      </div>
    </>}
  </>;
}
