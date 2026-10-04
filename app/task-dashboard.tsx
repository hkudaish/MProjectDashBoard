"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  Clock3,
  FileBarChart,
  Film,
  Images,
  LayoutDashboard,
  LogIn,
  LogOut,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { OWNER_LABELS, STATUS_LABELS, type Task, type TaskStatus } from "@/lib/types";

type TimingState = "late" | "active" | "soon" | "upcoming" | "done";
type TaskPatch = Partial<Pick<Task, "status" | "progress" | "ownerType" | "assignee" | "notes" | "title" | "plannedDate" | "endDate">>;

const PRODUCTS = [
  { id: "digital", name: "المحتوى الرقمي", target: "188 بوست", icon: Images, color: "#177f8f" },
  { id: "infographic", name: "الإنفوجرافيك", target: "13 منشوراً", icon: Sparkles, color: "#d89b27" },
  { id: "film", name: "الأفلام التوعوية", target: "3 أفلام", icon: Film, color: "#5869aa" },
  { id: "report", name: "التقارير الاستراتيجية", target: "3 تقارير", icon: FileBarChart, color: "#b95f58" },
];

const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as [TaskStatus, string][];
const OWNER_OPTIONS = Object.entries(OWNER_LABELS);

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function timingState(task: Task): TimingState {
  if (task.status === "completed") return "done";
  const now = todayStart();
  const start = parseDate(task.plannedDate);
  const end = parseDate(task.endDate);
  if (now > end) return "late";
  if (now >= start && now <= end) return "active";
  const diff = Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
  return diff <= 7 ? "soon" : "upcoming";
}

function formatDate(value: string, withYear = false) {
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(parseDate(value));
}

async function requestTasks() {
  const response = await fetch("/api/tasks", { cache: "no-store" });
  const data = await response.json() as { tasks?: Task[]; error?: string };
  if (!response.ok) throw new Error(data.error || "تعذر تحميل المهام.");
  return data.tasks ?? [];
}

function dateRange(task: Task) {
  if (task.plannedDate === task.endDate) return formatDate(task.plannedDate, true);
  return `${formatDate(task.plannedDate)} - ${formatDate(task.endDate, true)}`;
}

function relativeTiming(task: Task) {
  const now = todayStart();
  const start = parseDate(task.plannedDate);
  const end = parseDate(task.endDate);
  const state = timingState(task);
  if (state === "done") return "أُنجزت";
  if (state === "active") {
    const left = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
    return left === 0 ? "تنتهي اليوم" : `متبقي ${left} يوم`;
  }
  if (state === "late") {
    const days = Math.ceil((now.getTime() - end.getTime()) / 86_400_000);
    return `متأخرة ${days} يوم`;
  }
  const days = Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
  return days === 0 ? "تبدأ اليوم" : `تبدأ بعد ${days} يوم`;
}

const timingStyles: Record<TimingState, string> = {
  late: "border-red-200 bg-red-50 text-red-700",
  active: "border-amber-200 bg-amber-50 text-amber-800",
  soon: "border-cyan-200 bg-cyan-50 text-cyan-800",
  upcoming: "border-slate-200 bg-slate-50 text-slate-600",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const statusStyles: Record<TaskStatus, string> = {
  not_started: "bg-slate-100 text-slate-700",
  in_progress: "bg-cyan-100 text-cyan-800",
  review: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  blocked: "bg-red-100 text-red-800",
};

function StatusPill({ status }: { status: TaskStatus }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-bold ${statusStyles[status]}`}>{STATUS_LABELS[status]}</span>;
}

function TimingPill({ task }: { task: Task }) {
  const state = timingState(task);
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-bold ${timingStyles[state]}`}>{relativeTiming(task)}</span>;
}

function LoadingView() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-8 sm:px-8">
      <div className="flex items-center justify-between"><Skeleton className="h-12 w-72" /><Skeleton className="h-10 w-28" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((n) => <Skeleton key={n} className="h-32 rounded-2xl" />)}</div>
      <Skeleton className="h-[420px] rounded-3xl" />
    </div>
  );
}

export function TaskDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [authConfigured, setAuthConfigured] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState<Task | null>(null);
  const [draft, setDraft] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const tasksRef = useRef<Task[]>([]);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await requestTasks());
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "تعذر تحميل المهام.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTasks = useCallback(() => {
    setLoading(true);
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    let current = true;
    void requestTasks().then((loadedTasks) => {
      if (current) setTasks(loadedTasks);
    }).catch((error: unknown) => {
      if (current) setLoadError(error instanceof Error ? error.message : "تعذر تحميل المهام.");
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    void fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { configured?: boolean; isAdmin?: boolean; email?: string | null };
      if (!response.ok) throw new Error("تعذر التحقق من صلاحيات الدخول.");
      if (!current) return;
      setAuthConfigured(Boolean(data.configured));
      setIsAdmin(Boolean(data.isAdmin));
      setAdminEmail(data.email ?? "");
    }).catch(() => {
      if (current) setAuthConfigured(false);
    }).finally(() => {
      if (current) setAuthLoading(false);
    });
    return () => { current = false; };
  }, []);

  async function submitAdminLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json() as { isAdmin?: boolean; email?: string; error?: string };
      if (!response.ok || !data.isAdmin) throw new Error(data.error || "تعذر تسجيل الدخول.");
      setIsAdmin(true);
      setAdminEmail(data.email ?? loginEmail);
      setLoginPassword("");
      setLoginOpen(false);
      toast.success("تم تسجيل الدخول كمسؤول");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "تعذر تسجيل الدخول.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function logoutAdmin() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("تعذر تسجيل الخروج.");
      setIsAdmin(false);
      setAdminEmail("");
      setEditing(null);
      setDraft(null);
      toast.success("تم تسجيل الخروج");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل الخروج.");
    }
  }

  const persistTask = useCallback(async (id: string, patch: TaskPatch, silent = false) => {
    const response = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await response.json() as { task?: Task; error?: string };
    if (!response.ok) throw new Error(data.error || "تعذر حفظ التعديل.");
    if (!data.task) throw new Error("لم ترجع الخدمة بيانات المهمة المحدثة.");
    setTasks((current) => current.map((task) => task.id === id ? data.task! : task));
    if (!silent) toast.success("تم حفظ تحديث المهمة");
    return data.task;
  }, []);

  useEffect(() => {
    type ModelContext = { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();

    void Promise.resolve(context.registerTool({
      name: "list_project_tasks",
      title: "عرض مهام المشروع",
      description: "يعرض مهام مشروع التواصل الاستراتيجي مع إمكانية التصفية بالمنتج أو الحالة.",
      inputSchema: { type: "object", properties: { productId: { type: "string" }, status: { type: "string" } }, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input: unknown) {
        const filters = (input ?? {}) as { productId?: string; status?: string };
        return tasksRef.current
          .filter((task) => !filters.productId || task.productId === filters.productId)
          .filter((task) => !filters.status || task.status === filters.status)
          .map(({ id, title, productName, status, progress, plannedDate, endDate, assignee }) => ({ id, title, productName, status, progress, plannedDate, endDate, assignee }));
      },
    }, { signal: controller.signal })).catch(() => undefined);

    void Promise.resolve(context.registerTool({
      name: "update_project_task",
      title: "تحديث مهمة المشروع",
      description: "يحدّث حالة مهمة أو نسبة إنجازها أو الشخص المسندة إليه ثم يحفظ التغيير.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["not_started", "in_progress", "review", "completed", "blocked"] },
          progress: { type: "number", minimum: 0, maximum: 100 },
          assignee: { type: "string" },
        },
        required: ["id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input: unknown) {
        const values = input as { id?: string; status?: TaskStatus; progress?: number; assignee?: string };
        if (!values.id) throw new Error("معرّف المهمة مطلوب");
        const { id, ...patch } = values;
        const task = await persistTask(id, patch, true);
        return { id: task.id, status: task.status, progress: task.progress, assignee: task.assignee };
      },
    }, { signal: controller.signal })).catch(() => undefined);

    return () => controller.abort();
  }, [persistTask]);

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesText = !normalized || `${task.title} ${task.productName} ${task.assignee} ${task.notes}`.toLowerCase().includes(normalized);
      return matchesText && (productFilter === "all" || task.productId === productFilter) && (statusFilter === "all" || task.status === statusFilter) && (ownerFilter === "all" || task.ownerType === ownerFilter);
    });
  }, [tasks, query, productFilter, statusFilter, ownerFilter]);

  const summary = useMemo(() => {
    const completed = tasks.filter((task) => task.status === "completed").length;
    const overdue = tasks.filter((task) => timingState(task) === "late").length;
    const active = tasks.filter((task) => timingState(task) === "active").length;
    const blocked = tasks.filter((task) => task.status === "blocked").length;
    return { completed, overdue, active, blocked, overall: tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length) : 0 };
  }, [tasks]);

  const attentionTasks = useMemo(() => tasks
    .filter((task) => timingState(task) === "late" || timingState(task) === "active" || task.status === "blocked")
    .sort((a, b) => parseDate(a.endDate).getTime() - parseDate(b.endDate).getTime())
    .slice(0, 6), [tasks]);

  const upcomingTasks = useMemo(() => tasks
    .filter((task) => ["soon", "upcoming"].includes(timingState(task)))
    .sort((a, b) => parseDate(a.plannedDate).getTime() - parseDate(b.plannedDate).getTime())
    .slice(0, 6), [tasks]);

  function openTask(task: Task) {
    if (!isAdmin) return;
    setEditing(task);
    setDraft({ ...task });
  }

  async function saveDraft() {
    if (!draft || !editing) return;
    setSaving(true);
    try {
      await persistTask(editing.id, {
        title: draft.title,
        status: draft.status,
        progress: draft.progress,
        ownerType: draft.ownerType,
        assignee: draft.assignee,
        plannedDate: draft.plannedDate,
        endDate: draft.endDate,
        notes: draft.notes,
      });
      setEditing(null);
      setDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التعديل.");
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(task: Task, status: TaskStatus) {
    const progress = status === "completed" ? 100 : status === "not_started" ? 0 : task.progress === 0 ? 10 : task.progress;
    try {
      await persistTask(task.id, { status, progress });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث الحالة.");
    }
  }

  if (loading) return <main dir="rtl" className="min-h-screen bg-[#f3f7f8]"><LoadingView /></main>;

  if (loadError) return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-[#f3f7f8] px-5">
      <div className="w-full max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-4 size-10 text-red-500" />
        <h1 className="text-xl font-black text-slate-900">تعذر فتح لوحة المتابعة</h1>
        <p className="mt-2 text-base leading-7 text-slate-600">{loadError}</p>
        <Button className="mt-6 bg-[#116d7b] hover:bg-[#0c5965]" onClick={refreshTasks}><RefreshCw /> إعادة المحاولة</Button>
      </div>
    </main>
  );

  return (
    <main dir="rtl" className="min-h-screen bg-[#f3f7f8] text-slate-900">
      <Toaster dir="rtl" position="top-center" richColors />
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#116d7b] text-white shadow-[0_8px_24px_rgba(17,109,123,.2)]"><ListChecks className="size-6" /></div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black sm:text-xl">متابعة منتجات التواصل الاستراتيجي</h1>
              <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">خطة التنفيذ للجزء الأول - ثلاثة أشهر</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? <>
              <span className="hidden max-w-40 truncate text-sm font-semibold text-emerald-700 sm:inline">{adminEmail}</span>
              <Button variant="outline" size="sm" className="h-10 rounded-xl border-slate-200 bg-white" onClick={() => void logoutAdmin()}><LogOut className="size-4" /><span className="hidden sm:inline">خروج المسؤول</span></Button>
            </> : <Button variant="outline" size="sm" className="h-10 rounded-xl border-slate-200 bg-white" onClick={() => { setLoginError(""); setLoginOpen(true); }} disabled={authLoading}><LogIn className="size-4" /><span className="hidden sm:inline">دخول المسؤول</span></Button>}
            <Button variant="outline" size="sm" className="h-10 rounded-xl border-slate-200 bg-white" onClick={refreshTasks}><RefreshCw className="size-4" /><span className="hidden sm:inline">تحديث البيانات</span></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-8 sm:py-8">
        <section className="mb-6 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-bold text-[#116d7b]">لوحة التنفيذ</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">صورة واضحة لما أُنجز وما يحتاج تدخلاً</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500"><CalendarDays className="size-4" /> اليوم: {new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date())}</div>
        </section>

        <section aria-label="ملخص الأداء" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="إجمالي المهام" value={tasks.length} note="ضمن 4 منتجات" icon={ListChecks} tone="teal" />
          <MetricCard label="المهام المكتملة" value={summary.completed} note={`${summary.overall}% متوسط الإنجاز`} icon={CheckCircle2} tone="green" />
          <MetricCard label="قيد الاستحقاق" value={summary.active} note="مهام ضمن فترتها الآن" icon={Clock3} tone="amber" />
          <MetricCard label="تحتاج تدخلاً" value={summary.overdue + summary.blocked} note={`${summary.overdue} متأخرة · ${summary.blocked} متعثرة`} icon={AlertTriangle} tone="red" />
        </section>

        <Tabs dir="rtl" value={tab} onValueChange={setTab} className="mt-7 text-right">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:w-fit">
            <TabsTrigger value="overview" className="h-10 rounded-xl px-4"><LayoutDashboard /> نظرة عامة</TabsTrigger>
            <TabsTrigger value="tasks" className="h-10 rounded-xl px-4"><ListChecks /> جميع المهام</TabsTrigger>
            <TabsTrigger value="timeline" className="h-10 rounded-xl px-4"><CalendarDays /> الجدول الزمني</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5 space-y-5">
            <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
                  <div><h3 className="text-lg font-black">يحتاج إلى انتباه</h3><p className="mt-1 text-sm text-slate-500">المهام المتأخرة والجارية والمتعثرة</p></div>
                  <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-black text-red-700">{attentionTasks.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {attentionTasks.length ? attentionTasks.map((task) => (
                    <button key={task.id} onClick={() => openTask(task)} className="group grid w-full grid-cols-[1fr_auto] gap-4 px-5 py-4 text-right transition hover:bg-slate-50 sm:px-6">
                      <div className="min-w-0"><div className="mb-1.5 flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-[#116d7b]">{task.productName}</span><TimingPill task={task} /></div><p className="line-clamp-2 text-base font-bold leading-7 text-slate-900">{task.title}</p><p className="mt-1 text-sm text-slate-500">{OWNER_LABELS[task.ownerType]}{task.assignee ? ` · ${task.assignee}` : " · لم يُسمَّ شخص مسؤول"}</p></div>
                      <div className="flex items-center gap-3"><div className="hidden w-24 sm:block"><div className="mb-1 text-right text-xs font-bold text-slate-500">{task.progress}%</div><Progress value={task.progress} className="bg-slate-100 [&_[data-slot=progress-indicator]]:bg-[#177f8f]" /></div><ChevronLeft className="size-5 text-slate-300 transition group-hover:-translate-x-1 group-hover:text-[#116d7b]" /></div>
                    </button>
                  )) : <div className="px-6 py-12 text-center text-slate-500"><CheckCircle2 className="mx-auto mb-3 size-9 text-emerald-500" />لا توجد مهام تتطلب تدخلاً حالياً.</div>}
                </div>
              </section>

              <section className="rounded-3xl bg-[#0f3440] p-6 text-white shadow-[0_18px_60px_rgba(15,52,64,.18)]">
                <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-cyan-200">التقدم العام</p><p className="mt-2 text-5xl font-black tabular-nums">{summary.overall}%</p></div><div className="grid size-12 place-items-center rounded-2xl bg-white/10"><Check className="size-6" /></div></div>
                <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-l from-[#32c6c8] to-[#78e2c4] transition-all" style={{ width: `${summary.overall}%` }} /></div>
                <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/10 pt-5"><div><p className="text-2xl font-black">{summary.completed}</p><p className="text-sm text-slate-300">مهمة مكتملة</p></div><div><p className="text-2xl font-black">{tasks.length - summary.completed}</p><p className="text-sm text-slate-300">مهمة متبقية</p></div></div>
                <div className="mt-6 rounded-2xl bg-white/7 p-4 text-sm leading-7 text-slate-200">تُحتسب النسبة من نسب الإنجاز المسجلة لكل مهمة، وليست من عدد المهام المكتملة فقط.</div>
              </section>
            </div>

            <section>
              <div className="mb-3"><h3 className="text-lg font-black">المنتجات الأربعة</h3><p className="mt-1 text-sm text-slate-500">تقدم كل مسار وفق مهامه المسندة</p></div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{PRODUCTS.map((product) => {
                const productTasks = tasks.filter((task) => task.productId === product.id);
                const progress = productTasks.length ? Math.round(productTasks.reduce((sum, task) => sum + task.progress, 0) / productTasks.length) : 0;
                const late = productTasks.filter((task) => timingState(task) === "late").length;
                const Icon = product.icon;
                return <button key={product.id} onClick={() => { setProductFilter(product.id); setTab("tasks"); }} className="rounded-3xl border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start justify-between"><div className="grid size-11 place-items-center rounded-2xl text-white" style={{ backgroundColor: product.color }}><Icon className="size-5" /></div><span className="text-2xl font-black tabular-nums">{progress}%</span></div>
                  <h4 className="mt-5 text-base font-black">{product.name}</h4><p className="mt-1 text-sm text-slate-500">{product.target} · {productTasks.length} مهمة</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: product.color }} /></div>
                  <div className="mt-3 flex items-center justify-between text-sm"><span className={late ? "font-bold text-red-600" : "text-slate-500"}>{late ? `${late} متأخرة` : "ضمن المسار"}</span><ChevronLeft className="size-4 text-slate-400" /></div>
                </button>;
              })}</div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4"><h3 className="text-lg font-black">المواعيد القادمة</h3><p className="mt-1 text-sm text-slate-500">أقرب ستة استحقاقات في الخطة</p></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{upcomingTasks.map((task) => <button key={task.id} onClick={() => openTask(task)} className="rounded-2xl border border-slate-200 p-4 text-right transition hover:border-[#7eb9c2] hover:bg-[#f7fbfc]"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-[#116d7b]">{task.productName}</span><span className="text-sm font-black text-slate-700">{formatDate(task.plannedDate)}</span></div><p className="mt-2 line-clamp-2 text-base font-bold leading-7">{task.title}</p><p className="mt-2 text-sm text-slate-500">{relativeTiming(task)}</p></button>)}</div>
            </section>
          </TabsContent>

          <TabsContent value="tasks" className="mt-5">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4 sm:p-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_210px_190px_190px]">
                  <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في المهام أو المسؤولين..." className="h-11 rounded-xl border-slate-200 pr-10" /></div>
                  <FilterSelect value={productFilter} onValueChange={setProductFilter} placeholder="كل المنتجات" options={[{ value: "all", label: "كل المنتجات" }, ...PRODUCTS.map((product) => ({ value: product.id, label: product.name }))]} />
                  <FilterSelect value={statusFilter} onValueChange={setStatusFilter} placeholder="كل الحالات" options={[{ value: "all", label: "كل الحالات" }, ...STATUS_OPTIONS.map(([value, label]) => ({ value, label }))]} />
                  <FilterSelect value={ownerFilter} onValueChange={setOwnerFilter} placeholder="كل الجهات" options={[{ value: "all", label: "كل الجهات" }, ...OWNER_OPTIONS.map(([value, label]) => ({ value, label }))]} />
                </div>
                <p className="mt-3 text-sm text-slate-500">عرض {filteredTasks.length} من {tasks.length} مهمة</p>
              </div>

              <div className="hidden lg:block">
                <Table dir="rtl" className="text-right [&_td]:text-right [&_th]:text-right">
                  <TableHeader><TableRow className="bg-slate-50 hover:bg-slate-50"><TableHead className="w-[44%] px-5 text-right">المهمة</TableHead><TableHead className="text-right">الموعد</TableHead><TableHead className="text-right">المسؤول</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">الإنجاز</TableHead><TableHead className="w-14" /></TableRow></TableHeader>
                  <TableBody>{filteredTasks.map((task) => <TableRow key={task.id} className="group"><TableCell className="whitespace-normal px-5 py-4"><p className="text-sm font-bold text-[#116d7b]">{task.productName}</p><p className="mt-1 font-bold leading-6 text-slate-900">{task.title}</p>{task.notes && <p className="mt-1 text-sm text-slate-500">{task.notes}</p>}</TableCell><TableCell className="py-4"><p className="font-bold text-slate-800">{dateRange(task)}</p><div className="mt-2"><TimingPill task={task} /></div></TableCell><TableCell className="py-4"><p className="font-bold">{OWNER_LABELS[task.ownerType]}</p><p className="mt-1 text-sm text-slate-500">{task.assignee || "غير مسند لشخص"}</p></TableCell><TableCell className="py-4">{isAdmin ? <Select dir="rtl" value={task.status} onValueChange={(value) => void quickStatus(task, value as TaskStatus)}><SelectTrigger className="h-10 w-[165px] rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select> : <StatusPill status={task.status} />}</TableCell><TableCell className="py-4"><div className="w-28"><div className="mb-1 text-sm font-black tabular-nums">{task.progress}%</div><Progress value={task.progress} className="bg-slate-100 [&_[data-slot=progress-indicator]]:bg-[#177f8f]" /></div></TableCell><TableCell className="px-4">{isAdmin && <Button variant="ghost" size="icon-sm" aria-label={`تعديل ${task.title}`} onClick={() => openTask(task)}><Pencil /></Button>}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>

              <div className="divide-y divide-slate-100 lg:hidden">{filteredTasks.map((task) => <button key={task.id} onClick={() => openTask(task)} className="w-full p-4 text-right"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-[#116d7b]">{task.productName}</span><StatusPill status={task.status} /><TimingPill task={task} /></div><p className="font-bold leading-7">{task.title}</p><div className="mt-3 flex items-end justify-between gap-4"><div className="text-sm text-slate-500"><p>{dateRange(task)}</p><p className="mt-1">{OWNER_LABELS[task.ownerType]}{task.assignee ? ` · ${task.assignee}` : ""}</p></div><div className="w-20"><p className="mb-1 text-right text-xs font-black">{task.progress}%</p><Progress value={task.progress} /></div></div></button>)}</div>
              {!filteredTasks.length && <div className="px-6 py-16 text-center text-slate-500"><CircleDashed className="mx-auto mb-3 size-10" />لا توجد مهام مطابقة لمعايير البحث.</div>}
            </section>
          </TabsContent>

          <TabsContent value="timeline" className="mt-5">
            <Timeline tasks={tasks} onOpen={openTask} />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={loginOpen} onOpenChange={(open) => { if (!loggingIn) setLoginOpen(open); }}>
        <DialogContent dir="rtl" className="text-right sm:max-w-md">
          <DialogHeader className="text-right sm:text-right"><DialogTitle>دخول المسؤول</DialogTitle><DialogDescription>الدخول مخصص للبريد الإلكتروني المعتمد لإدارة لوحة المتابعة.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void submitAdminLogin(event)} className="grid gap-4">
            <label className="grid gap-2 text-sm font-bold">البريد الإلكتروني<Input type="email" autoComplete="username" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-bold">كلمة المرور<Input type="password" autoComplete="current-password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label>
            {loginError && <p role="alert" className="text-sm font-semibold text-red-700">{loginError}</p>}
            {!authConfigured && <p role="alert" className="text-sm text-amber-800">دخول المسؤول غير مُعدّ على الخادم.</p>}
            <DialogFooter className="flex-row-reverse justify-start sm:justify-start"><Button type="submit" className="bg-[#116d7b] hover:bg-[#0c5965]" disabled={loggingIn || !authConfigured}>{loggingIn ? <Loader2 className="animate-spin" /> : <LogIn />}دخول</Button><Button type="button" variant="outline" onClick={() => setLoginOpen(false)} disabled={loggingIn}>إلغاء</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing && isAdmin} onOpenChange={(open) => { if (!open && !saving) { setEditing(null); setDraft(null); } }}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto rounded-3xl border-slate-200 text-right [&_[data-slot=dialog-close]]:right-auto [&_[data-slot=dialog-close]]:left-4 sm:max-w-2xl">
          <DialogHeader className="text-right sm:text-right"><DialogTitle className="text-xl font-black">تحديث المهمة</DialogTitle><DialogDescription className="leading-6">عدّل الإسناد والحالة ونسبة الإنجاز أو التوقيت، ثم احفظ التغييرات.</DialogDescription></DialogHeader>
          {draft && <div className="grid gap-5 py-2">
            <label className="grid gap-2 text-sm font-bold">عنوان المهمة<Textarea value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="min-h-24 rounded-xl text-base leading-7" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold">الحالة<Select dir="rtl" value={draft.status} onValueChange={(value) => setDraft({ ...draft, status: value as TaskStatus, progress: value === "completed" ? 100 : value === "not_started" ? 0 : draft.progress })}><SelectTrigger className="h-11 w-full rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
              <label className="grid gap-2 text-sm font-bold">جهة الإسناد<Select dir="rtl" value={draft.ownerType} onValueChange={(value) => setDraft({ ...draft, ownerType: value })}><SelectTrigger className="h-11 w-full rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{OWNER_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
            </div>
            <label className="grid gap-2 text-sm font-bold">المسؤول المباشر<div className="relative"><UserRound className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} placeholder="اكتب اسم الشخص المسؤول" className="h-11 rounded-xl pr-10" /></div></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">تاريخ البداية<Input type="date" value={draft.plannedDate} onChange={(event) => setDraft({ ...draft, plannedDate: event.target.value })} className="h-11 rounded-xl" /></label><label className="grid gap-2 text-sm font-bold">تاريخ النهاية<Input type="date" value={draft.endDate} min={draft.plannedDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} className="h-11 rounded-xl" /></label></div>
            <label className="grid gap-3 text-sm font-bold"><span className="flex items-center justify-between"><span>نسبة الإنجاز</span><strong className="text-lg text-[#116d7b]">{draft.progress}%</strong></span><Slider dir="rtl" min={0} max={100} step={5} value={[draft.progress]} onValueChange={(value) => setDraft({ ...draft, progress: value[0], status: value[0] === 100 ? "completed" : draft.status === "completed" ? "in_progress" : draft.status })} className="[&_[data-slot=slider-range]]:bg-[#177f8f] [&_[data-slot=slider-thumb]]:border-[#177f8f]" /></label>
            <label className="grid gap-2 text-sm font-bold">ملاحظات التنفيذ<Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="أضف آخر المستجدات أو العوائق أو تفاصيل التسليم..." className="min-h-28 rounded-xl text-base leading-7" /></label>
          </div>}
          <DialogFooter className="flex-row-reverse justify-start sm:justify-start"><Button className="h-11 rounded-xl bg-[#116d7b] px-6 hover:bg-[#0c5965]" onClick={() => void saveDraft()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Check />}حفظ التحديث</Button><Button variant="outline" className="h-11 rounded-xl" onClick={() => { setEditing(null); setDraft(null); }} disabled={saving}>إلغاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function MetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: number; note: string; icon: typeof ListChecks; tone: "teal" | "green" | "amber" | "red" }) {
  const styles = { teal: "bg-cyan-50 text-[#116d7b]", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" };
  return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-4xl font-black tabular-nums text-slate-950">{value}</p></div><div className={`grid size-11 place-items-center rounded-2xl ${styles[tone]}`}><Icon className="size-5" /></div></div><p className="mt-3 text-sm text-slate-500">{note}</p></div>;
}

function FilterSelect({ value, onValueChange, placeholder, options }: { value: string; onValueChange: (value: string) => void; placeholder: string; options: { value: string; label: string }[] }) {
  return <Select dir="rtl" value={value} onValueChange={onValueChange}><SelectTrigger className="h-11 w-full rounded-xl border-slate-200 text-right"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent dir="rtl">{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}

function Timeline({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const monthGroups = useMemo(() => {
    const groups = new Map<string, Task[]>();
    tasks.forEach((task) => {
      const key = task.plannedDate.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), task]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);
  return <section className="space-y-4">{monthGroups.map(([month, monthTasks]) => {
    const monthDate = parseDate(`${month}-01`);
    return <div key={month} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between bg-[#103e49] px-5 py-4 text-white sm:px-6"><div><p className="text-sm font-bold text-cyan-200">الشهر</p><h3 className="mt-1 text-xl font-black">{new Intl.DateTimeFormat("ar-SA", { month: "long", year: "numeric" }).format(monthDate)}</h3></div><span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{monthTasks.length} مهمة</span></div><div className="divide-y divide-slate-100">{monthTasks.map((task) => <button key={task.id} onClick={() => onOpen(task)} className="grid w-full gap-3 px-5 py-4 text-right transition hover:bg-slate-50 md:grid-cols-[105px_1fr_175px_120px] md:items-center sm:px-6"><div className="flex items-center gap-2 font-black text-slate-800"><span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-sm">{parseDate(task.plannedDate).getDate()}</span><span className="text-sm text-slate-500">{new Intl.DateTimeFormat("ar-SA", { month: "short" }).format(parseDate(task.plannedDate))}</span></div><div><p className="text-sm font-bold text-[#116d7b]">{task.productName}</p><p className="mt-1 font-bold leading-6">{task.title}</p></div><div className="text-sm"><p className="font-bold">{OWNER_LABELS[task.ownerType]}</p><p className="mt-1 text-slate-500">{task.assignee || "غير مسند لشخص"}</p></div><div><TimingPill task={task} /></div></button>)}</div></div>;
  })}</section>;
}
