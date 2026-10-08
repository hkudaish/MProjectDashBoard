import { MANAGER_POSITIONS, type Position, type PublicUser } from "./user-types";
export function isManager(position: Position | null | undefined) { return Boolean(position && position !== "employee"); }
export function subordinateUsers(users: PublicUser[], email: string): PublicUser[] {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const user of users) if (user.email !== email && user.managerEmail && (user.managerEmail === email || descendants.has(user.managerEmail)) && !descendants.has(user.email)) { descendants.add(user.email); changed = true; }
  }
  return users.filter((user) => descendants.has(user.email));
}
export function managerOptions(users: PublicUser[], position: Position, email = "") { return users.filter((user) => user.email !== email && user.active && user.position && MANAGER_POSITIONS[position].includes(user.position)); }
