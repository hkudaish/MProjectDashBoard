"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POSITIONS, MANAGER_POSITIONS, type Position, type PublicUser } from "@/lib/user-types";
import { HierarchyPath } from "@/components/hierarchy-path";
import { managerOptions, supervisorChain } from "@/lib/hierarchy";
export type ManagerPosition = Position;
export type HierarchyDraft = { position: Position; managerEmail: string | null; additionalManagerEmail: string | null; managerPosition?: ManagerPosition; entityId: string | null };
export function UserHierarchyFields({ value, onChange, users, disabled, email = "", lockPosition = false }: { value: HierarchyDraft; onChange: (value: HierarchyDraft) => void; users: PublicUser[]; disabled: boolean; email?: string; lockPosition?: boolean }) {
  const allowedPositions = MANAGER_POSITIONS[value.position];
  const selectedManager = users.find((user) => user.email === value.managerEmail);
  const availableManagers = managerOptions(users, value.position, email);
  const selectedPosition = value.managerPosition ?? (selectedManager?.position && allowedPositions.includes(selectedManager.position) ? selectedManager.position : allowedPositions.find((position) => availableManagers.some((user) => user.position === position)) ?? allowedPositions[0]);
  const managers = availableManagers.filter((user) => user.position === selectedPosition);
  const valid = Boolean(selectedManager?.active && selectedManager.email !== email && selectedManager.position === selectedPosition && !value.additionalManagerEmail);
  return <>
    <label className="grid gap-2 text-sm font-bold">المنصب الوظيفي
      <Select dir="rtl" value={value.position} disabled={disabled || lockPosition} onValueChange={(position) => onChange({ ...value, position: position as Position, managerEmail: null, additionalManagerEmail: null, managerPosition: undefined, entityId: position === "system_admin" ? null : value.entityId })}>
        <SelectTrigger className="w-full rounded-xl text-right"><SelectValue /></SelectTrigger>
        <SelectContent dir="rtl">{Object.entries(POSITIONS).map(([position, name]) => <SelectItem key={position} value={position}>{name}</SelectItem>)}</SelectContent>
      </Select>
    </label>
    {allowedPositions.length === 0 ? <p className="self-center text-sm text-teal-900">{value.position === "system_admin" ? "حساب تقني مستقل خارج الهيكل الوظيفي." : "أعلى الهيكل الوظيفي — لا يتبع لمسؤول مباشر."}</p> : <>
      <label className="grid gap-2 text-sm font-bold">منصب المسؤول المباشر
        <Select dir="rtl" value={selectedPosition} disabled={disabled} onValueChange={(position) => onChange({ ...value, managerPosition: position as Position, managerEmail: null, additionalManagerEmail: null })}>
          <SelectTrigger className="w-full rounded-xl text-right"><SelectValue /></SelectTrigger>
          <SelectContent dir="rtl">{allowedPositions.map((position) => <SelectItem key={position} value={position}>{POSITIONS[position]}</SelectItem>)}</SelectContent>
        </Select>
      </label>
      <label className="grid gap-2 text-sm font-bold">يتبع إداريًا (اختياري)
        <Select dir="rtl" value={value.managerEmail ?? "none"} disabled={disabled} onValueChange={(managerEmail) => onChange({ ...value, managerEmail: managerEmail === "none" ? null : managerEmail, additionalManagerEmail: null })}>
          <SelectTrigger className="w-full rounded-xl text-right"><SelectValue placeholder="اختر اسم المسؤول المباشر" /></SelectTrigger>
          <SelectContent dir="rtl"><SelectItem value="none">بدون تبعية إدارية</SelectItem>{managers.map((manager) => <SelectItem key={manager.email} value={manager.email}>{manager.name} · {POSITIONS[manager.position!]}</SelectItem>)}
            {value.managerEmail && !managers.some((manager) => manager.email === value.managerEmail) && <SelectItem value={value.managerEmail} disabled>{selectedManager?.name ?? value.managerEmail} · يلزم تعديل التبعية</SelectItem>}
          </SelectContent>
        </Select>
        {!managers.length && <span className="text-xs font-normal text-amber-800">لا يوجد حساب نشط بمنصب «{POSITIONS[selectedPosition]}». يمكنك حفظ الحساب بدون تبعية، ثم ربطه لاحقًا.</span>}
      </label>
      <div className="grid gap-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3 sm:col-span-2">
        <p className="text-xs font-bold text-sky-900">التسلسل الإداري حتى المسؤول المباشر</p>
        {selectedManager ? <><HierarchyPath users={supervisorChain(users, value.managerEmail)} />{!valid && <p role="alert" className="text-xs font-semibold text-red-700">اختر مسؤولًا نشطًا بالمنصب المطلوب لإكمال التبعية.</p>}</> : <p className="text-xs text-slate-500">يمكنك حفظ المستخدم بدون مسؤول مباشر، أو اختيار مسؤول لإظهار التسلسل الإداري.</p>}
      </div>
    </>}
  </>;
}
