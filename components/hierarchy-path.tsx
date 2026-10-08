import { ChevronLeft } from "lucide-react";
import { Fragment } from "react";
import { POSITIONS, type PublicUser } from "@/lib/user-types";
export function HierarchyPath({ users }: { users: PublicUser[] }) {
  return <ol aria-label="التسلسل الإداري" className="flex flex-wrap items-center gap-1.5 text-xs leading-5">{users.filter((user) => user.position !== "system_admin").map((user, index) => <Fragment key={user.email}>{index > 0 && <li aria-hidden="true"><ChevronLeft className="size-3 text-slate-400" /></li>}<li className="rounded-lg border border-slate-200 bg-white px-2 py-1"><span className="font-semibold text-slate-800">{user.name}</span><span className="mr-1 text-teal-700">({user.position ? POSITIONS[user.position] : "منصب غير محدد"})</span></li></Fragment>)}</ol>;
}
