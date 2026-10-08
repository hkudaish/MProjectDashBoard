import { MANAGER_POSITIONS, type Position, type PublicUser } from "./user-types";
export function isManager(position: Position | null | undefined) { return Boolean(position && position !== "employee"); }
export function subordinateUsers(users: PublicUser[], email: string): PublicUser[] {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const user of users) if (user.email !== email && user.managerEmail && user.position && users.some((manager) => manager.email === user.managerEmail && manager.position && MANAGER_POSITIONS[user.position!].includes(manager.position)) && (user.managerEmail === email || descendants.has(user.managerEmail)) && !descendants.has(user.email)) { descendants.add(user.email); changed = true; }
  }
  return users.filter((user) => descendants.has(user.email));
}
export function managerOptions(users: PublicUser[], position: Position, email = "") { return users.filter((user) => user.email !== email && user.active && user.position && MANAGER_POSITIONS[position].includes(user.position)); }

export function supervisorChain(users: PublicUser[], managerEmail: string | null): PublicUser[] {
  const chain: PublicUser[] = [];
  const visited = new Set<string>();
  let email = managerEmail;
  while (email && !visited.has(email)) {
    visited.add(email);
    const user = users.find((candidate) => candidate.email === email);
    if (!user) break;
    chain.unshift(user);
    email = user.managerEmail;
  }
  return chain;
}
