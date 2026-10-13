"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SETTINGS_SECTIONS, canOpenSettings, type SettingsSection } from "@/lib/settings-sections";
import { POSITIONS } from "@/lib/user-types";
import type { RegistrationRequest } from "@/lib/registration-types";
import { useSettingsWorkspace } from "@/components/settings-workspace";
import { SettingsCreateForm } from "@/components/settings-create-forms";
import { PermissionsDialog } from "@/components/permissions-dialog";
import { ActivityDialog } from "@/components/activity-dialog";
import { UserAccountManager } from "@/components/user-account-manager";
import { EntityManager } from "@/components/entity-manager";
import { MailboxDialog } from "@/components/mailbox-dialog";
import { PasswordChangeDialog } from "@/components/password-dialogs";
import { RegistrationRequestDialog, RegistrationReviewDialog } from "@/components/registration-dialogs";
export function SettingsContent({ section }: { section: SettingsSection }) {
  const workspace = useSettingsWorkspace(), router = useRouter(), params = useSearchParams();
  const { session, projectId, projects, entities, approvedRequest, setApprovedRequest, refresh, reloadCatalog } = workspace;
  const [restoredRequest, setRestoredRequest] = useState<RegistrationRequest | null>(null), [requestError, setRequestError] = useState("");
  const requestId = section === "users" ? params.get("request") : null;
  useEffect(() => { if (!requestId || approvedRequest?.id === requestId || !session?.canManageUsers) return; let cancelled = false; void fetch("/api/registration-requests", { cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("تعذر تحميل طلب التسجيل المعتمد."); const data = await response.json() as { requests: RegistrationRequest[] }; const request = data.requests.find(request => request.id === requestId && request.status === "approved"); if (!request) throw new Error("الطلب غير متاح للاعتماد أو سبق تفعيل حسابه."); if (!cancelled) setRestoredRequest(request); }).catch(error => { if (!cancelled) setRequestError(error.message); }); return () => { cancelled = true; }; }, [requestId, approvedRequest?.id, session?.canManageUsers]);
  const close = (open: boolean) => { if (!open) router.push("/settings/account"); };
  const changed = () => { void refresh(); void reloadCatalog(); };
  const initialRegistration = requestId ? approvedRequest?.id === requestId ? approvedRequest : restoredRequest : null;
  if (!canOpenSettings(section, session)) return <section className="rounded-3xl border border-amber-200 bg-white p-8"><ShieldCheck className="mb-3 size-8 text-amber-600" /><h1 className="text-xl font-black">هذه الصفحة غير متاحة لحسابك</h1><p className="mt-3 text-sm leading-7 text-slate-600">{session?.authenticated ? "تواصل مع مدير النظام إذا كنت تحتاج صلاحية استخدام هذا القسم." : "سجّل الدخول للوصول إلى الإعدادات المتاحة لحسابك."}</p><Button asChild variant="outline" className="mt-4"><Link href={session?.authenticated ? "/settings/account" : "/?login=1"}>{session?.authenticated ? "الحساب الحالي" : "تسجيل الدخول"}</Link></Button></section>;
  let content: React.ReactNode;
  switch (section) {
    case "account": content = <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">{session?.authenticated ? <dl className="grid gap-5 sm:grid-cols-2">{[["اسم المستخدم", session.name || "مستخدم"], ["المنصب", session.position ? POSITIONS[session.position] : "غير محدد"], ["البريد الإلكتروني", session.loginEmail || session.email], ["الجهة", session.position === "system_admin" ? "مستقل" : entities.find(entity => entity.id === session.entityId)?.name || "غير محددة"], ["اسم المشروع", projects.find(project => project.id === session.projectId)?.name || "غير محدد"], ["حالة الحساب", "نشط"]].map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-2 break-words text-sm font-bold text-slate-900">{value}</dd></div>)}</dl> : <div><h2 className="font-bold text-teal-900">أهلاً بك في نظام متابعة المشروع الإعلامي</h2><p className="mt-3 text-sm leading-7 text-slate-600">سجّل الدخول إلى حسابك، أو قدّم طلب تسجيل لمراجعته من مدير النظام.</p><div className="mt-5 flex flex-wrap gap-2"><Button asChild><Link href="/?login=1">تسجيل الدخول</Link></Button><Button asChild variant="outline"><Link href="/settings/registration">طلب تسجيل</Link></Button></div></div>}</section>; break;
    case "permissions": content = <PermissionsDialog embedded open onOpenChange={close} initialEmail={params.get("user") ?? undefined} onChanged={changed} />; break;
    case "projects": content = <SettingsCreateForm />; break;
    case "products": content = <SettingsCreateForm product />; break;
    case "activity": content = <ActivityDialog embedded open onOpenChange={close} administrator={Boolean(session?.canManageUsers)} />; break;
    case "registration": content = <RegistrationRequestDialog embedded open onOpenChange={close} />; break;
    case "requests": content = <RegistrationReviewDialog embedded open onOpenChange={() => {}} onApproved={request => { setApprovedRequest(request); router.push(`/settings/users?request=${encodeURIComponent(request.id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`); }} />; break;
    case "mail": content = <MailboxDialog embedded open onOpenChange={close} />; break;
    case "password": content = <PasswordChangeDialog embedded open required={false} onOpenChange={close} onSaved={() => void refresh()} onLogout={workspace.logout} />; break;
    case "users": content = <>{requestError && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{requestError}</p>}<UserAccountManager embedded open currentEmail={session?.email ?? ""} projectId={projectId} initialRegistration={initialRegistration} onOpenChange={close} onChanged={changed} onRegistrationCompleted={() => { setApprovedRequest(null); setRestoredRequest(null); router.replace(`/settings/users${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`); }} onPermissions={email => router.push(`/settings/permissions?user=${encodeURIComponent(email)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`)} /></>; break;
    case "entities": content = <EntityManager embedded open onOpenChange={close} onChanged={changed} />; break;
  }
  return <><div className="mb-5"><p className="mb-2 text-xs text-slate-500">الإعدادات / {SETTINGS_SECTIONS[section].label}</p><h1 className="text-2xl font-black text-slate-900">{SETTINGS_SECTIONS[section].label}</h1><p className="mt-2 text-sm leading-7 text-slate-500">{SETTINGS_SECTIONS[section].description}</p></div>{content}</>;
}
