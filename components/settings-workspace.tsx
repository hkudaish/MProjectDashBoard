"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronLeft, FolderPlus, KeyRound, LayoutDashboard, ListChecks, LogIn, LogOut, Mail, PackagePlus, Settings, ShieldCheck, User, UserPlus, Users } from "lucide-react";
import { toast, Toaster } from "sonner";
import { clearTaskUndo } from "@/lib/task-undo";
import { Button } from "@/components/ui/button";
import { UserGreeting } from "@/components/user-greeting";
import { ChatPanel } from "@/components/chat-panel";
import { LoginDialog } from "@/components/login-dialog";
import { PasswordChangeDialog } from "@/components/password-dialogs";
import { useRegistrationCount } from "@/components/registration-dialogs";
import { SETTINGS_SECTIONS, canOpenSettings, type SettingsSection } from "@/lib/settings-sections";
import type { Entity, PublicUser, SessionInfo } from "@/lib/user-types";
import type { Project } from "@/lib/types";
import type { RegistrationRequest } from "@/lib/registration-types";
type Workspace = { openLogin: () => void; session: SessionInfo | null; loading: boolean; error: string; projects: Project[]; entities: Entity[]; users: PublicUser[]; projectId: string; setProjectId: (id: string) => void; refresh: () => Promise<void>; reloadCatalog: () => Promise<void>; logout: () => Promise<void>; approvedRequest: RegistrationRequest | null; setApprovedRequest: (request: RegistrationRequest | null) => void };
const Context = createContext<Workspace | null>(null);
export function useSettingsWorkspace() { const value = useContext(Context); if (!value) throw new Error("Settings context missing"); return value; }
const ICONS = { account: User, permissions: ShieldCheck, projects: FolderPlus, products: PackagePlus, activity: ListChecks, registration: UserPlus, requests: ListChecks, mail: Mail, password: KeyRound, users: Users, entities: Building2 };
export function SettingsWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [loginOpen, setLoginOpen] = useState(false);
  const openLogin = () => setLoginOpen(true);
  const [session, setSession] = useState<SessionInfo | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [projects, setProjects] = useState<Project[]>([]), [entities, setEntities] = useState<Entity[]>([]), [users, setUsers] = useState<PublicUser[]>([]);
  const [projectId, setProjectId] = useState(""), [approvedRequest, setApprovedRequest] = useState<RegistrationRequest | null>(null), [loggingOut, setLoggingOut] = useState(false);
  const refresh = useCallback(async () => { try { const response = await fetch("/api/auth/session", { cache: "no-store" }); if (!response.ok) throw new Error("تعذر تحميل حسابك."); setSession(await response.json() as SessionInfo); setError(""); } catch (error) { setError(error instanceof Error ? error.message : "تعذر تحميل الحساب."); } finally { setLoading(false); } }, []);
  useEffect(() => { const start = setTimeout(() => void refresh(), 0); const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 12000); return () => { clearTimeout(start); clearInterval(timer); }; }, [refresh]);
  const authenticated = session?.authenticated, temporary = session?.mustChangePassword, identity = session?.email, accountProject = session?.projectId;
  const reloadCatalog = useCallback(async () => {
    try {
      const [projectResponse, entityResponse] = await Promise.all([fetch("/api/projects", { cache: "no-store" }), fetch("/api/entities", { cache: "no-store" })]);
      if (!projectResponse.ok || !entityResponse.ok) throw new Error("تعذر تحميل المشاريع أو الجهات.");
      const projectData = await projectResponse.json() as { projects: Project[] }, entityData = await entityResponse.json() as { entities: Entity[] };
      setProjects(projectData.projects); setEntities(entityData.entities);
      const requested = new URLSearchParams(window.location.search).get("project");
      setProjectId(current => projectData.projects.some(project => project.id === current) ? current : projectData.projects.find(project => project.id === requested)?.id ?? projectData.projects.find(project => project.id === accountProject)?.id ?? projectData.projects[0]?.id ?? "");
      if (authenticated && identity && !temporary) { const response = await fetch("/api/users/directory", { cache: "no-store" }); if (!response.ok) throw new Error("تعذر تحميل التابعين للإسناد."); const directory = await response.json() as { assignableUsers: PublicUser[] }; setUsers(directory.assignableUsers); } else setUsers([]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحميل البيانات."); }
  }, [authenticated, temporary, identity, accountProject]);
  useEffect(() => { if (loading) return; const timer = setTimeout(() => void reloadCatalog(), 0); return () => clearTimeout(timer); }, [loading, reloadCatalog]);
  async function logout() { setLoggingOut(true); try { const response = await fetch("/api/auth/logout", { method: "POST" }); if (!response.ok) throw new Error("تعذر تسجيل الخروج."); setApprovedRequest(null); clearTaskUndo(); await refresh(); toast.success("تم تسجيل الخروج."); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تسجيل الخروج."); } finally { setLoggingOut(false); } }
  const pending = useRegistrationCount(Boolean(session?.canManageUsers));
  const navigation = <nav aria-label="أقسام الإعدادات" className="grid gap-1">{(Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).filter(section => canOpenSettings(section, session)).map(section => { const Icon = ICONS[section], active = pathname === `/settings/${section}`; return <Link aria-current={active ? "page" : undefined} key={section} href={`/settings/${section}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active ? "bg-teal-700 font-bold text-white shadow-sm" : "text-slate-600 hover:bg-teal-50 hover:text-teal-900"}`}><Icon className="size-4 shrink-0" /><span>{SETTINGS_SECTIONS[section].label}</span>{section === "requests" && pending > 0 && <span className="ms-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{pending}</span>}{active && <ChevronLeft className="ms-auto size-4" />}</Link>; })}</nav>;
  const value: Workspace = { openLogin, session, loading, error, projects, entities, users, projectId, setProjectId, refresh, reloadCatalog, logout, approvedRequest, setApprovedRequest };
  return <Context.Provider value={value}><main dir="rtl" className="min-h-screen bg-[#f3f7f8] text-slate-900"><Toaster dir="rtl" position="top-center" richColors /><header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8"><Link href={`/${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`} className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-teal-700 text-white"><ListChecks className="size-6" /></span><span><span className="block text-base font-black sm:text-xl">متابعة منتجات المشروع الإعلامي</span><span className="mt-1 block text-xs text-slate-500">الإعدادات وإدارة النظام</span></span></Link><div className="flex flex-wrap items-center gap-2"><ChatPanel session={session} key={session?.email ?? "guest"} /><UserGreeting name={session?.authenticated ? session.name : null} />{session?.authenticated ? <Button variant="outline" disabled={loggingOut} onClick={() => void logout()}><LogOut className="size-4" />تسجيل الخروج</Button> : <Button variant="outline" disabled={loading} onClick={openLogin}><LogIn className="size-4" />تسجيل الدخول</Button>}</div></div></header><div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-6 sm:px-8 lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="min-w-0"><div className="hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-28 lg:block lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"><h1 className="mb-4 flex items-center gap-2 px-3 text-lg font-black text-teal-900"><Settings className="size-5" />الإعدادات</h1>{navigation}<Link href={`/${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`} className="mt-5 flex items-center gap-2 border-t border-slate-100 px-3 pt-4 text-sm font-bold text-teal-800"><LayoutDashboard className="size-4" />العودة إلى لوحة المعلومات</Link></div><details className="rounded-2xl border border-slate-200 bg-white p-4 lg:hidden"><summary className="cursor-pointer font-bold text-teal-900">الإعدادات — اختر القسم</summary><div className="mt-3">{navigation}</div></details></aside><div className="min-w-0">{loading ? <p role="status" className="rounded-3xl border bg-white p-8 text-slate-500">جارٍ تحميل الإعدادات…</p> : error ? <div role="alert" className="rounded-3xl border border-rose-200 bg-white p-8"><p>{error}</p><Button variant="outline" onClick={() => void refresh()} className="mt-3">إعادة المحاولة</Button></div> : session?.authenticated && session.mustChangePassword ? <><h1 className="mb-4 text-2xl font-black">تغيير كلمة المرور مطلوب</h1><PasswordChangeDialog embedded open required onOpenChange={() => {}} onSaved={() => void refresh()} onLogout={logout} /></> : children}</div></div><LoginDialog open={loginOpen} onOpenChange={setLoginOpen} configured={Boolean(session?.configured)} onSignedIn={next => { setSession(next); setApprovedRequest(null); }} /></main></Context.Provider>;
}
