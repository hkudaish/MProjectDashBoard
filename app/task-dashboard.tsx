"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Plus,
  KeyRound,
  Building2,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { ProjectClock } from "@/components/project-clock";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
import { EntityManager } from "@/components/entity-manager";
import { TaskAssigneeSelect } from "@/components/task-assignee-select";
import { UserAccountManager } from "@/components/user-account-manager";
import { PasswordChangeDialog, PasswordResetRequestDialog } from "@/components/password-dialogs";
import { DEFAULT_PROJECT, projectInputSchema } from "@/lib/projects";
import { POSITIONS, type Entity, type PublicUser, type SessionInfo } from "@/lib/user-types";
import { TaskDetailsEditor } from "@/components/task-details-editor";
import { TaskDetailsReport } from "@/components/task-details-report";
import { DEFAULT_PRODUCTS, DEFAULT_PROJECT_ID, productInputSchema, taskInputSchema } from "@/lib/products";
import { taskDetailsSchema } from "@/lib/task-details";
import { progressForStatus } from "@/lib/task-progress";
import { PRODUCT_COLORS, STATUS_COLORS, productColors } from "@/lib/task-theme";
import { OWNER_LABELS, STATUS_LABELS, type Task, type TaskStatus, type Product, type Project } from "@/lib/types";

type TimingState = "late" | "active" | "soon" | "upcoming" | "done";
type TaskPatch = Partial<Pick<Task, "status" | "progress" | "ownerType" | "assignee" | "notes" | "title" | "plannedDate" | "endDate" | "details" | "assigneeEmail">>;

const PRODUCT_ICONS = [
  { id: "digital", name: "المحتوى الرقمي", target: "188 بوست", icon: Images },
  { id: "infographic", name: "الإنفوجرافيك", target: "13 منشوراً", icon: Sparkles },
  { id: "film", name: "الأفلام التوعوية", target: "3 أفلام", icon: Film },
  { id: "report", name: "التقارير الاستراتيجية", target: "3 تقارير", icon: FileBarChart },
];

const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as [TaskStatus, string][];

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
  return (data.tasks ?? []).map((task) => ({ ...task, progress: progressForStatus(task.status, task.progress) }));
}

async function requestProducts(): Promise<Product[]> {
  const response = await fetch("/api/products", { cache: "no-store" });
  const data = await response.json() as { products: Product[]; error?: string };
  if (!response.ok) throw new Error(data.error || "تعذر تحميل المنتجات.");
  return data.products;
}

async function requestProjects(): Promise<Project[]> {
  const response = await fetch("/api/projects", { cache: "no-store" });
  const data = await response.json() as { projects: Project[]; error?: string };
  if (!response.ok) throw new Error(data.error || "تعذر تحميل المشاريع.");
  return data.projects;
}

async function requestEntities(): Promise<Entity[]> {
  const response = await fetch("/api/entities", { cache: "no-store" });
  const data = await response.json() as { entities: Entity[]; error?: string };
  if (!response.ok) throw new Error(data.error || "تعذر تحميل الجهات.");
  return data.entities;
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
  soon: "border-sky-200 bg-sky-50 text-sky-800",
  upcoming: "border-slate-200 bg-slate-50 text-slate-600",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const STATUS_ICONS = {
  not_started: CircleDashed,
  in_progress: Clock3,
  review: FileBarChart,
  completed: CheckCircle2,
  blocked: AlertTriangle,
};

function StatusPill({ status }: { status: TaskStatus }) {
  const Icon = STATUS_ICONS[status];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-bold ${STATUS_COLORS[status].badge}`}><Icon aria-hidden="true" className="size-3.5 shrink-0" />{STATUS_LABELS[status]}</span>;
}

function ProductPill({ task }: { task: Task }) {
  const colors = productColors(task.productId);
  const Icon = PRODUCT_ICONS.find((product) => product.id === task.productId)?.icon ?? ListChecks;
  return <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-sm font-bold" style={{ color: colors.ink, backgroundColor: colors.surface, borderColor: colors.border }}><Icon aria-hidden="true" className="size-3.5 shrink-0" /><span>{task.productName}</span></span>;
}

function TaskProgress({ task }: { task: Task }) {
  return <Progress value={task.progress} className={`bg-slate-100 ${STATUS_COLORS[task.status].progress}`} />;
}

function TimingPill({ task }: { task: Task }) {
  const state = timingState(task);
  const Icon = state === "late" ? AlertTriangle : state === "done" ? CheckCircle2 : state === "active" ? Clock3 : CalendarDays;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-bold ${timingStyles[state]}`}><Icon aria-hidden="true" className="size-3.5 shrink-0" />{relativeTiming(task)}</span>;
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
  const [entities, setEntities] = useState<Entity[]>([]);
  const [assignmentUsers, setAssignmentUsers] = useState<PublicUser[]>([]);
  const [entitiesOpen, setEntitiesOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [projects, setProjects] = useState<Project[]>([DEFAULT_PROJECT]);
  const [activeProjectId, setActiveProjectId] = useState(DEFAULT_PROJECT_ID);
  const [projectDraft, setProjectDraft] = useState<Omit<Project, "id"> | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectSaving, setProjectSaving] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [productDraft, setProductDraft] = useState<Omit<Product, "id"> | null>(null);
  const [productSaving, setProductSaving] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [authConfigured, setAuthConfigured] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [adminManagerOpen, setAdminManagerOpen] = useState(false);
  const [userSession, setUserSession] = useState<SessionInfo | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [resetRequestOpen, setResetRequestOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      const [loadedTasks, loadedProducts, loadedProjects, loadedEntities] = await Promise.all([requestTasks(), requestProducts(), requestProjects(), requestEntities()]);
      setTasks(loadedTasks);
      setProducts(loadedProducts);
      setProjects(loadedProjects);
      setEntities(loadedEntities);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "تعذر تحميل المهام.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refreshTasks = useCallback(() => {
    setRefreshing(true);
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    let current = true;
    void Promise.all([requestTasks(), requestProducts(), requestProjects(), requestEntities()]).then(([loadedTasks, loadedProducts, loadedProjects, loadedEntities]) => {
      if (current) { setTasks(loadedTasks); setProducts(loadedProducts); setProjects(loadedProjects); setEntities(loadedEntities); }
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
      const data = await response.json() as SessionInfo;
      if (!response.ok) throw new Error("تعذر التحقق من صلاحيات الدخول.");
      if (!current) return;
      setUserSession(data);
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

  const loadDirectory = useCallback(async () => {
    try { const response = await fetch("/api/users/directory", { cache: "no-store" }); const data = await response.json() as { assignableUsers?: PublicUser[] }; setAssignmentUsers(response.ok ? data.assignableUsers ?? [] : []); }
    catch { setAssignmentUsers([]); }
  }, []);
  useEffect(() => {
    if (!userSession?.authenticated || userSession.mustChangePassword) return;
    const timer = setTimeout(() => { void loadDirectory(); void loadTasks(); }, 0);
    return () => clearTimeout(timer);
  }, [userSession?.authenticated, userSession?.mustChangePassword, userSession?.email, loadDirectory, loadTasks]);
  const ownerLabels = useMemo(() => {
    const labels: Record<string, string> = { joint: OWNER_LABELS.joint, unassigned: OWNER_LABELS.unassigned };
    for (const entity of entities) if (!entity.hidden && !entity.deleted) labels[entity.id] = entity.name;
    return labels;
  }, [entities]);
  const OWNER_OPTIONS = Object.entries(ownerLabels);
  function taskCanEdit(task: Task) { return task.permissions?.canEdit ?? userSession?.position === "system_admin"; }
  const canEditMain = creatingTask || draft?.permissions?.canEditMain === true || userSession?.position === "system_admin";
  const canUpdateMain = creatingTask || draft?.permissions?.canUpdateMain === true || userSession?.position === "system_admin";
  const canAssign = creatingTask || draft?.permissions?.canAssign === true || userSession?.position === "system_admin";
  function refreshAdministration() {
    void loadDirectory(); void loadTasks();
    void fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json() as Promise<SessionInfo>).then((session: SessionInfo) => { setUserSession(session); setIsAdmin(session.isAdmin); setAdminEmail(session.email ?? ""); }).catch(() => undefined);
  }

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
      const data = await response.json() as SessionInfo & { error?: string };
      if (!response.ok || !data.authenticated) throw new Error(data.error || "تعذر تسجيل الدخول.");
      setUserSession(data);
      setIsAdmin(data.isAdmin);
      setAdminEmail(data.email ?? loginEmail);
      setLoginPassword("");
      setLoginOpen(false);
      toast.success(data.mustChangePassword ? "غيّر كلمة المرور لإكمال الدخول." : "تم تسجيل الدخول");
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
      setUserSession(null);
      setPasswordOpen(false);
      setProductDraft(null);
      setEntitiesOpen(false);
      setAssignmentUsers([]);
      setAdminManagerOpen(false);
      setIsAdmin(false);
      setAdminEmail("");
      setEditing(null);
      setCreatingTask(false);
      setDraft(null);
      void loadTasks();
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
      description: "يعرض مهام المشاريع الإعلامية مع إمكانية التصفية بالمنتج أو الحالة.",
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

  const currentProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const visibleProducts = useMemo(() => products.filter((product) => (product.projectId ?? DEFAULT_PROJECT_ID) === activeProjectId), [products, activeProjectId]);
  const projectTasks = useMemo(() => {
    const ids = new Set(visibleProducts.map((product) => product.id));
    return tasks.filter((task) => ids.has(task.productId));
  }, [tasks, visibleProducts]);

  function selectProject(id: string) {
    setActiveProjectId(id); setProductFilter("all"); setStatusFilter("all"); setOwnerFilter("all"); setQuery("");
  }

  async function saveProject() {
    if (!userSession?.canManageUsers || !projectDraft) return;
    const parsed = projectInputSchema.safeParse(projectDraft);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message); return; }
    setProjectSaving(true);
    try {
      const response = await fetch("/api/projects", { method: editingProjectId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...parsed.data, ...(editingProjectId ? { id: editingProjectId } : {}) }) });
      const data = await response.json() as { project: Project; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر حفظ المشروع.");
      setProjects((current) => editingProjectId ? current.map((p) => p.id === data.project.id ? data.project : p) : [...current, data.project]);
      selectProject(data.project.id); setProjectDraft(null); setEditingProjectId(null);
      toast.success(editingProjectId ? "تم حفظ تعديلات المشروع." : "تم إنشاء المشروع. أضف منتجاته ثم مهامه.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ المشروع."); }
    finally { setProjectSaving(false); }
  }

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projectTasks.filter((task) => {
      const matchesText = !normalized || `${task.title} ${task.productName} ${task.assignee} ${task.notes} ${(task.details ?? []).map((detail) => `${detail.description} ${detail.assignee} ${detail.ownerName ?? ownerLabels[detail.ownerType] ?? OWNER_LABELS[detail.ownerType] ?? ""}`).join(" ")}`.toLowerCase().includes(normalized);
      return matchesText && (productFilter === "all" || task.productId === productFilter) && (statusFilter === "all" || task.status === statusFilter) && (ownerFilter === "all" || task.ownerType === ownerFilter);
    });
  }, [projectTasks, query, productFilter, statusFilter, ownerFilter, ownerLabels]);

  const summary = useMemo(() => {
    const completed = projectTasks.filter((task) => task.status === "completed").length;
    const overdue = projectTasks.filter((task) => timingState(task) === "late").length;
    const active = projectTasks.filter((task) => timingState(task) === "active").length;
    const blocked = projectTasks.filter((task) => task.status === "blocked").length;
    return { completed, overdue, active, blocked, overall: projectTasks.length ? Math.round(projectTasks.reduce((sum, task) => sum + task.progress, 0) / projectTasks.length) : 0 };
  }, [projectTasks]);

  const attentionTasks = useMemo(() => projectTasks
    .filter((task) => timingState(task) === "late" || timingState(task) === "active" || task.status === "blocked")
    .sort((a, b) => parseDate(a.endDate).getTime() - parseDate(b.endDate).getTime())
    .slice(0, 6), [projectTasks]);

  const upcomingTasks = useMemo(() => projectTasks
    .filter((task) => ["soon", "upcoming"].includes(timingState(task)))
    .sort((a, b) => parseDate(a.plannedDate).getTime() - parseDate(b.plannedDate).getTime())
    .slice(0, 6), [projectTasks]);

  function openTask(task: Task) {
    if (!taskCanEdit(task)) return;
    setCreatingTask(false);
    setEditing(task);
    setDraft({ ...task, details: (task.details ?? []).map((detail) => ({ ...detail })) });
  }

  function newTask(productId = visibleProducts[0]?.id ?? "") {
    if (!isAdmin) return;
    const date = new Date();
    const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setEditing(null);
    setCreatingTask(true);
    setDraft({ id: "", productId, productName: products.find((p) => p.id === productId)?.name ?? "", title: "", details: [],
      plannedDate: today, endDate: today, status: "not_started", progress: 0, ownerType: "unassigned", assignee: "", notes: "", sourceOrder: 0, updatedAt: "" });
  }

  async function saveProduct() {
    if (!isAdmin || !productDraft || editingProductId && !userSession?.canManageUsers) return;
    const parsed = productInputSchema.safeParse(productDraft);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message); return; }
    setProductSaving(true);
    try {
      const response = await fetch("/api/products", { method: editingProductId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...parsed.data, ...(editingProductId ? { id: editingProductId } : {}) }) });
      const data = await response.json() as { product: Product; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر إضافة المنتج.");
      setProducts((current) => editingProductId ? current.map((p) => p.id === data.product.id ? data.product : p) : [...current, data.product]);
      if (editingProductId) setTasks((current) => current.map((task) => task.productId === data.product.id ? { ...task, productName: data.product.name } : task));
      setEditingProductId(null);
      setProductDraft(null);
      toast.success(editingProductId ? "تم حفظ تعديلات المنتج." : "تمت إضافة المنتج. يمكنك الآن إضافة مهامه.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر إضافة المنتج."); }
    finally { setProductSaving(false); }
  }

  async function saveDraft() {
    if (!draft || (!editing && !creatingTask)) return;
    if (creatingTask) {
      const valid = taskInputSchema.safeParse(draft);
      if (!valid.success) { toast.error(valid.error.issues[0]?.message); return; }
    }
    if (!creatingTask && !editing?.permissions?.canEdit && userSession?.position !== "system_admin") return;
    const details = taskDetailsSchema.safeParse(draft.details ?? []);
    if (!details.success) {
      toast.error(details.error.issues[0]?.message || "تفاصيل المهمة غير صحيحة.");
      return;
    }
    setSaving(true);
    try {
      if (creatingTask) {
        const response = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
        const data = await response.json() as { task: Task; error?: string };
        if (!response.ok) throw new Error(data.error || "تعذر إضافة المهمة.");
        setTasks((current) => [...current, data.task]);
        toast.success("تمت إضافة المهمة.");
      } else if (editing) await persistTask(editing.id, {
        title: draft.title,
        status: draft.status,
        progress: progressForStatus(draft.status, draft.progress),
        ownerType: draft.ownerType,
        assignee: draft.assignee,
        ...(draft.assigneeEmail !== undefined ? { assigneeEmail: draft.assigneeEmail } : {}),
        plannedDate: draft.plannedDate,
        endDate: draft.endDate,
        notes: draft.notes,
        details: details.data,
      });
      setEditing(null);
      setCreatingTask(false);
      setDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ التعديل.");
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(task: Task, status: TaskStatus) {
    const progress = progressForStatus(status, task.progress);
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
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#116d7b] text-white shadow-[0_8px_24px_rgba(17,109,123,.2)]"><ListChecks className="size-6" /></div>
            <div className="min-w-0">
              <h1 className="text-lg font-black sm:text-xl">متابعة منتجات المشروع الإعلامي</h1>
              <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">خطة التنفيذ للجزء الأول - ثلاثة أشهر</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu dir="rtl"><DropdownMenuTrigger asChild><Button variant="outline" className="rounded-xl border-teal-100 bg-teal-50/50 text-teal-900"><Settings className="size-4" /><span>الإعدادات</span></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 rounded-2xl p-2 text-right">
                <DropdownMenuLabel className="space-y-1 px-3 py-2"><p className="text-xs font-normal text-slate-500">الحساب الحالي</p>{userSession?.authenticated ? <><p className="font-bold text-teal-900">{userSession.position ? POSITIONS[userSession.position] : "مستخدم"}</p><p dir="ltr" className="break-all text-right text-xs font-normal text-slate-600">{userSession.loginEmail ?? adminEmail}</p></> : <p className="text-sm text-slate-600">لم تسجّل الدخول</p>}</DropdownMenuLabel>
                {userSession?.authenticated && <><DropdownMenuSeparator /><DropdownMenuItem className="gap-2 rounded-lg" onSelect={() => setPasswordOpen(true)}><KeyRound className="size-4" />تغيير كلمة المرور</DropdownMenuItem>
                  {userSession.canManageUsers && <><DropdownMenuItem className="gap-2 rounded-lg" onSelect={() => setAdminManagerOpen(true)}><UserPlus className="size-4" />إدارة المستخدمين</DropdownMenuItem><DropdownMenuItem className="gap-2 rounded-lg" onSelect={() => setEntitiesOpen(true)}><Building2 className="size-4" />إدارة الجهات</DropdownMenuItem></>}
                </>}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" className="rounded-xl border-slate-200 bg-white" disabled={authLoading} onClick={() => { if (userSession?.authenticated) void logoutAdmin(); else { setLoginError(""); setLoginOpen(true); } }}>{userSession?.authenticated ? <LogOut className="size-4" /> : <LogIn className="size-4" />}<span>{userSession?.authenticated ? "تسجيل الخروج" : "تسجيل الدخول"}</span></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-8 sm:py-8">
        <ProjectClock />
        <section aria-label="اختيار المشروع" className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
          <label className="grid min-w-60 flex-1 gap-2 text-sm font-bold text-teal-900">المشروع<Select dir="rtl" value={activeProjectId} onValueChange={selectProject}><SelectTrigger className="h-11 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></label>
          {userSession?.canManageUsers && <><Button variant="outline" className="h-11 rounded-xl" onClick={() => { setEditingProjectId(null); setProjectDraft({ name: "", description: "" }); }}><Plus />إضافة مشروع</Button><Button variant="outline" className="h-11 rounded-xl" onClick={() => { if (currentProject) { setEditingProjectId(currentProject.id); setProjectDraft({ name: currentProject.name, description: currentProject.description, entityIds: currentProject.entityIds ?? [] }); } }}><Pencil />تعديل المشروع</Button></>}
          {currentProject?.description && <p className="w-full whitespace-pre-wrap text-sm leading-6 text-slate-500">{currentProject.description}</p>}
          <div className="flex w-full flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap gap-3">{isAdmin && <>
          {userSession?.canManageProducts && <Button className="rounded-xl bg-teal-700 hover:bg-teal-800" onClick={() => { setEditingProductId(null); setProductDraft({ projectId: activeProjectId, name: "", target: "", description: "", details: [] }); }}><Plus />إضافة منتج</Button>}
          <Button variant="outline" className="rounded-xl border-teal-200 text-teal-800" disabled={!visibleProducts.length} onClick={() => newTask()}><Plus />إضافة مهمة</Button>
            </>}</div>
            <Button variant="outline" className="rounded-xl border-slate-200 text-slate-600" onClick={refreshTasks} disabled={refreshing}><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />تحديث البيانات</Button>
          </div>
        </section>
        <section className="mb-6 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">لوحة المعلومات ومتابعة الإنجاز</h2>
          </div>
        </section>

        <section aria-label="ملخص الأداء" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="إجمالي المهام" value={projectTasks.length} note={`ضمن ${visibleProducts.length} منتجات`} icon={ListChecks} tone="teal" />
          <MetricCard label="المهام المكتملة" value={summary.completed} note={`${summary.overall}% متوسط الإنجاز`} icon={CheckCircle2} tone="green" />
          <MetricCard label="قيد الاستحقاق" value={summary.active} note="مهام ضمن فترتها الآن" icon={Clock3} tone="amber" />
          <MetricCard label="تحتاج تدخلاً" value={summary.overdue + summary.blocked} note={`${summary.overdue} متأخرة · ${summary.blocked} متعثرة`} icon={AlertTriangle} tone="red" />
        </section>

        <Tabs dir="rtl" value={tab} onValueChange={setTab} className="mt-7 text-right">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:w-fit">
            <TabsTrigger value="overview" className="h-10 rounded-xl px-4 font-bold hover:bg-teal-50 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-800 data-[state=active]:border-teal-200"><LayoutDashboard /> نظرة عامة</TabsTrigger>
            <TabsTrigger value="tasks" className="h-10 rounded-xl px-4 font-bold hover:bg-indigo-50 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-800 data-[state=active]:border-indigo-200"><ListChecks /> جميع المهام</TabsTrigger>
            <TabsTrigger value="timeline" className="h-10 rounded-xl px-4 font-bold hover:bg-sky-50 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-800 data-[state=active]:border-sky-200"><CalendarDays /> الجدول الزمني</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5 space-y-5">
            <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
              <section className="overflow-hidden rounded-3xl border border-red-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-gradient-to-l from-red-50 to-white px-5 py-4 sm:px-6">
                  <div><h3 className="flex items-center gap-2 text-lg font-black text-red-900"><AlertTriangle aria-hidden="true" className="size-5 text-red-700" />يحتاج إلى انتباه</h3><p className="mt-1 text-sm text-slate-500">المهام المتأخرة والجارية والمتعثرة</p></div>
                  <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-black text-red-700">{attentionTasks.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {attentionTasks.length ? attentionTasks.map((task) => (
                    <button key={task.id} onClick={() => openTask(task)} className="group grid w-full grid-cols-[1fr_auto] gap-4 px-5 py-4 text-right transition hover:bg-slate-50 sm:px-6">
                      <div className="min-w-0"><div className="mb-1.5 flex flex-wrap items-center gap-2"><ProductPill task={task} /><StatusPill status={task.status} /><TimingPill task={task} /></div><p className="line-clamp-2 text-base font-bold leading-7 text-slate-900">{task.title}</p><p className="mt-1 text-sm text-slate-500">{task.ownerName ?? ownerLabels[task.ownerType] ?? OWNER_LABELS[task.ownerType]}{task.assignee ? ` · ${task.assignee}` : " · لم يُسمَّ شخص مسؤول"}</p></div>
                      <div className="flex items-center gap-3"><div className="hidden w-24 sm:block"><div className="mb-1 text-right text-xs font-bold text-slate-500">{task.progress}%</div><TaskProgress task={task} /></div><ChevronLeft className="size-5 text-slate-300 transition group-hover:-translate-x-1 group-hover:text-[#116d7b]" /></div>
                    </button>
                  )) : <div className="px-6 py-12 text-center text-slate-500"><CheckCircle2 className="mx-auto mb-3 size-9 text-emerald-500" />لا توجد مهام تتطلب تدخلاً حالياً.</div>}
                </div>
              </section>

              <section className="rounded-3xl bg-[#0f3440] p-6 text-white shadow-[0_18px_60px_rgba(15,52,64,.18)]">
                <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-cyan-200">التقدم العام</p><p className="mt-2 text-5xl font-black tabular-nums">{summary.overall}%</p></div><div className="grid size-12 place-items-center rounded-2xl bg-white/10"><Check className="size-6" /></div></div>
                <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-l from-[#32c6c8] to-[#78e2c4] transition-all" style={{ width: `${summary.overall}%` }} /></div>
                <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/10 pt-5"><div><p className="text-2xl font-black">{summary.completed}</p><p className="text-sm text-slate-300">مهمة مكتملة</p></div><div><p className="text-2xl font-black">{projectTasks.length - summary.completed}</p><p className="text-sm text-slate-300">مهمة متبقية</p></div></div>
                <div className="mt-6 rounded-2xl bg-white/7 p-4 text-sm leading-7 text-slate-200">تُحسب النسبة بمتوسط إنجاز المهام: لم يبدأ 0%، قيد التنفيذ 50%، بانتظار المراجعة 80%، مكتمل 100%. يحتفظ المتعثر بآخر نسبة إنجاز له.</div>
              </section>
            </div>

            <section>
              <div className="mb-3"><h3 className="flex items-center gap-2 text-lg font-black text-teal-900"><Images aria-hidden="true" className="size-5 text-teal-700" />المنتجات</h3><p className="mt-1 text-sm text-slate-500">تقدم كل مسار وفق مهامه المسندة</p></div>
              {!visibleProducts.length && <p className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/40 p-6 text-sm leading-7 text-slate-600">لم تُضف منتجات لهذا المشروع بعد.{isAdmin && " ابدأ بإضافة منتج، ثم أضف مهامه."}</p>}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{visibleProducts.map((product) => {
                const productTasks = projectTasks.filter((task) => task.productId === product.id);
                const progress = productTasks.length ? Math.round(productTasks.reduce((sum, task) => sum + task.progress, 0) / productTasks.length) : 0;
                const late = productTasks.filter((task) => timingState(task) === "late").length;
                const Icon = PRODUCT_ICONS.find((item) => item.id === product.id)?.icon ?? ListChecks;
                const colors = productColors(product.id);
                return <article key={product.id} className="min-w-0"><button onClick={() => { setProductFilter(product.id); setTab("tasks"); }} className="w-full rounded-3xl border border-t-4 p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#116d7b]" style={{ borderColor: colors.border, borderTopColor: colors.accent, background: `linear-gradient(145deg, #ffffff, ${colors.surface})` }}>
                  <div className="flex items-start justify-between"><div className="grid size-11 place-items-center rounded-2xl text-white" style={{ backgroundColor: colors.accent }}><Icon className="size-5" /></div><span className="text-2xl font-black tabular-nums" style={{ color: colors.ink }}>{progress}%</span></div>
                  <h4 className="mt-5 text-base font-black" style={{ color: colors.ink }}>{product.name}</h4><p className="mt-1 text-sm text-slate-500">{product.target} · {productTasks.length} مهمة</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: colors.accent }} /></div>
                  <div className="mt-3 flex items-center justify-between text-sm"><span className={late ? "rounded-full bg-red-50 px-2 py-1 font-bold text-red-700" : "rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-800"}>{late ? `${late} متأخرة` : "ضمن المسار"}</span><ChevronLeft className="size-4 text-slate-400" /></div>
                </button>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(product.description || product.details?.length) && <Button variant="outline" size="sm" onClick={() => setViewingProduct(product)}>تفاصيل المنتج</Button>}
                  {userSession?.canManageUsers && <Button variant="outline" size="sm" onClick={() => { setEditingProductId(product.id); setProductDraft({ ...product, details: (product.details ?? []).map((detail) => ({ ...detail })) }); }}><Pencil />تعديل المنتج</Button>}
                  {isAdmin && <Button variant="outline" size="sm" onClick={() => newTask(product.id)}><Plus />إضافة مهمة</Button>}
                </div>
                </article>;
              })}</div>
            </section>

            <section className="rounded-3xl border border-sky-200 bg-gradient-to-br from-white to-sky-50/60 p-5 shadow-sm sm:p-6">
              <div className="mb-4"><h3 className="flex items-center gap-2 text-lg font-black text-sky-900"><CalendarDays aria-hidden="true" className="size-5 text-sky-700" />المواعيد القادمة</h3><p className="mt-1 text-sm text-slate-500">أقرب ستة استحقاقات في الخطة</p></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{upcomingTasks.map((task) => <button key={task.id} onClick={() => openTask(task)} className="rounded-2xl border border-sky-100 bg-white p-4 text-right shadow-sm transition hover:border-sky-300 hover:bg-sky-50"><div className="flex items-center justify-between gap-3"><ProductPill task={task} /><span className="shrink-0 rounded-lg bg-sky-50 px-2 py-1 text-sm font-black text-sky-800">{formatDate(task.plannedDate)}</span></div><p className="mt-2 line-clamp-2 text-base font-bold leading-7">{task.title}</p><p className="mt-2 text-sm text-slate-500">{relativeTiming(task)}</p></button>)}</div>
            </section>
          </TabsContent>

          <TabsContent value="tasks" className="mt-5">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-indigo-100 bg-gradient-to-l from-indigo-50/70 to-white p-4 sm:p-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_210px_190px_190px]">
                  <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في المهام أو المسؤولين..." className="h-11 rounded-xl border-slate-200 pr-10" /></div>
                  <FilterSelect value={productFilter} onValueChange={setProductFilter} placeholder="كل المنتجات" options={[{ value: "all", label: "كل المنتجات" }, ...visibleProducts.map((product) => ({ value: product.id, label: product.name }))]} />
                  <FilterSelect value={statusFilter} onValueChange={setStatusFilter} placeholder="كل الحالات" options={[{ value: "all", label: "كل الحالات" }, ...STATUS_OPTIONS.map(([value, label]) => ({ value, label }))]} />
                  <FilterSelect value={ownerFilter} onValueChange={setOwnerFilter} placeholder="كل الجهات" options={[{ value: "all", label: "كل الجهات" }, ...OWNER_OPTIONS.map(([value, label]) => ({ value, label }))]} />
                </div>
                <p className="mt-3 text-sm text-slate-500">عرض {filteredTasks.length} من {projectTasks.length} مهمة</p>
              </div>

              <div className="hidden lg:block">
                <Table dir="rtl" className="text-right [&_td]:text-right [&_th]:text-right">
                  <TableHeader><TableRow className="bg-indigo-50/60 hover:bg-indigo-50/60 [&_th]:font-bold [&_th]:text-indigo-900"><TableHead className="w-[44%] px-5 text-right">المهمة</TableHead><TableHead className="text-right">الموعد</TableHead><TableHead className="text-right">المسؤول</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">الإنجاز</TableHead><TableHead className="w-14" /></TableRow></TableHeader>
                  <TableBody>{filteredTasks.map((task) => (
                    <Fragment key={task.id}>
                      <TableRow className={task.details?.length ? "group border-b-0" : "group"}>
                        <TableCell className="whitespace-normal px-5 py-4 align-top">
                          <ProductPill task={task} />
                          <p className="mt-1 font-bold leading-6 text-slate-900">{task.title}</p>
                          {task.notes && <p className="mt-1 text-sm text-slate-500">{task.notes}</p>}
                        </TableCell>
                        <TableCell className="pb-4 pt-12 align-top"><p className="font-bold text-slate-800">{dateRange(task)}</p><div className="mt-2"><TimingPill task={task} /></div></TableCell>
                        <TableCell className="pb-4 pt-12 align-top"><p className="font-bold">{task.ownerName ?? ownerLabels[task.ownerType] ?? OWNER_LABELS[task.ownerType]}</p><p className="mt-1 text-sm text-slate-500">{task.assignee || "غير مسند لشخص"}</p></TableCell>
                        <TableCell className="pb-4 pt-12 align-top">{(task.permissions?.canUpdateMain || userSession?.position === "system_admin") ? <Select dir="rtl" value={task.status} onValueChange={(value) => void quickStatus(task, value as TaskStatus)}><SelectTrigger className={`h-10 w-[165px] rounded-xl text-right font-bold ${STATUS_COLORS[task.status].badge}`}><SelectValue /></SelectTrigger><SelectContent dir="rtl">{STATUS_OPTIONS.map(([value, label]) => <SelectItem className={`my-1 rounded-lg ${STATUS_COLORS[value].badge}`} key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select> : <StatusPill status={task.status} />}</TableCell>
                        <TableCell className="pb-4 pt-12 align-top"><div className="w-28"><div className="mb-1 text-sm font-black tabular-nums">{task.progress}%</div><TaskProgress task={task} /></div></TableCell>
                        <TableCell className="px-4 pb-4 pt-12 align-top">{taskCanEdit(task) && <Button variant="ghost" size="icon-sm" aria-label={`تعديل ${task.title}`} onClick={() => openTask(task)}><Pencil /></Button>}</TableCell>
                      </TableRow>
                      {!!task.details?.length && <TableRow className="hover:bg-transparent"><TableCell colSpan={6} className="px-5 pb-5 pt-0"><TaskDetailsReport task={task} ownerLabels={ownerLabels} /></TableCell></TableRow>}
                    </Fragment>
                  ))}</TableBody>
                </Table>
              </div>

              <div className="divide-y divide-slate-100 lg:hidden">{filteredTasks.map((task) => <button key={task.id} onClick={() => openTask(task)} className="w-full p-4 text-right"><div className="mb-2 flex flex-wrap items-center gap-2"><ProductPill task={task} /><StatusPill status={task.status} /><TimingPill task={task} /></div><p className="font-bold leading-7">{task.title}</p><div className="mt-3 flex items-end justify-between gap-4"><div className="text-sm text-slate-500"><p>{dateRange(task)}</p><p className="mt-1">{task.ownerName ?? ownerLabels[task.ownerType] ?? OWNER_LABELS[task.ownerType]}{task.assignee ? ` · ${task.assignee}` : ""}</p></div><div className="w-20"><p className="mb-1 text-right text-xs font-black">{task.progress}%</p><TaskProgress task={task} /></div></div><TaskDetailsReport task={task} ownerLabels={ownerLabels} /></button>)}</div>
              {!filteredTasks.length && <div className="px-6 py-16 text-center text-slate-500"><CircleDashed className="mx-auto mb-3 size-10" />لا توجد مهام مطابقة لمعايير البحث.</div>}
            </section>
          </TabsContent>

          <TabsContent value="timeline" className="mt-5">
            <Timeline tasks={projectTasks} onOpen={openTask} ownerLabels={ownerLabels} />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={loginOpen} onOpenChange={(open) => { if (!loggingIn) setLoginOpen(open); }}>
        <DialogContent dir="rtl" className="text-right sm:max-w-md">
          <DialogHeader className="text-right sm:text-right"><DialogTitle>تسجيل الدخول</DialogTitle><DialogDescription>أدخل بريد حسابك وكلمة المرور. تحدد صلاحيات الحساب إمكانية التعديل وإدارة المستخدمين.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void submitAdminLogin(event)} className="grid gap-4">
            <label className="grid gap-2 text-sm font-bold">البريد الإلكتروني<Input type="email" autoComplete="username" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-bold">كلمة المرور<Input type="password" autoComplete="current-password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label>
            {loginError && <p role="alert" className="text-sm font-semibold text-red-700">{loginError}</p>}
            {!authConfigured && <p role="alert" className="text-sm text-amber-800">تسجيل الدخول غير مُعدّ على الخادم.</p>}
            <Button type="button" variant="link" className="justify-start px-0 text-teal-800" disabled={loggingIn} onClick={() => { setLoginPassword(""); setLoginOpen(false); setResetRequestOpen(true); }}>نسيت كلمة المرور؟ طلب إعادة ضبط</Button>
            <DialogFooter className="flex-row-reverse justify-start sm:justify-start"><Button type="submit" className="bg-[#116d7b] hover:bg-[#0c5965]" disabled={loggingIn || !authConfigured}>{loggingIn ? <Loader2 className="animate-spin" /> : <LogIn />}دخول</Button><Button type="button" variant="outline" onClick={() => setLoginOpen(false)} disabled={loggingIn}>إلغاء</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <EntityManager open={entitiesOpen && Boolean(userSession?.canManageUsers)} onOpenChange={setEntitiesOpen} onChanged={refreshAdministration} />
      <UserAccountManager onChanged={refreshAdministration} open={adminManagerOpen && Boolean(userSession?.canManageUsers)} onOpenChange={setAdminManagerOpen} currentEmail={adminEmail} />
      <PasswordChangeDialog open={Boolean(userSession?.authenticated && (passwordOpen || userSession.mustChangePassword))} required={Boolean(userSession?.mustChangePassword)} onOpenChange={setPasswordOpen} onLogout={logoutAdmin} onSaved={(session) => { setUserSession(session); setIsAdmin(session.isAdmin); setAdminEmail(session.email ?? ""); }} />
      <PasswordResetRequestDialog open={resetRequestOpen} onOpenChange={setResetRequestOpen} />

      <Dialog open={!!projectDraft && Boolean(userSession?.canManageUsers)} onOpenChange={(open) => { if (!open && !projectSaving) { setProjectDraft(null); setEditingProjectId(null); } }}>
        <DialogContent dir="rtl" className="rounded-3xl text-right sm:max-w-lg"><DialogHeader className="text-right sm:text-right"><DialogTitle>{editingProjectId ? "تعديل المشروع" : "إضافة مشروع جديد"}</DialogTitle><DialogDescription>لكل مشروع منتجاته ومهامه. اختر المشروع من القائمة لمتابعة إنجازه وإدارة محتواه.</DialogDescription></DialogHeader>
          {projectDraft && <fieldset disabled={projectSaving} className="grid gap-4"><label className="grid gap-2 text-sm font-bold">اسم المشروع<Input maxLength={120} value={projectDraft.name} onChange={(event) => setProjectDraft({ ...projectDraft, name: event.target.value })} className="h-11 rounded-xl" /></label><label className="grid gap-2 text-sm font-bold">وصف المشروع<Textarea maxLength={1200} value={projectDraft.description} onChange={(event) => setProjectDraft({ ...projectDraft, description: event.target.value })} className="rounded-xl" /></label><div className="grid gap-2"><p className="text-sm font-bold">الجهات المسؤولة عن المشروع</p>{entities.filter((entity) => !entity.deleted && (!entity.hidden || projectDraft.entityIds?.includes(entity.id))).map((entity) => <label key={entity.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={projectDraft.entityIds?.includes(entity.id) ?? false} disabled={entity.hidden && !projectDraft.entityIds?.includes(entity.id)} onChange={(event) => setProjectDraft({ ...projectDraft, entityIds: event.target.checked ? [...(projectDraft.entityIds ?? []), entity.id] : (projectDraft.entityIds ?? []).filter((id) => id !== entity.id) })} />{entity.name}{entity.hidden && " · محجوبة"}</label>)}</div></fieldset>}
          <DialogFooter><Button disabled={projectSaving} onClick={() => void saveProject()}>{projectSaving ? <Loader2 className="animate-spin" /> : <Check />}{editingProjectId ? "حفظ التعديلات" : "إنشاء المشروع"}</Button><Button variant="outline" disabled={projectSaving} onClick={() => { setProjectDraft(null); setEditingProjectId(null); }}>إلغاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!productDraft && isAdmin} onOpenChange={(open) => { if (!open && !productSaving) { setProductDraft(null); setEditingProductId(null); } }}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto rounded-3xl text-right sm:max-w-6xl">
          <DialogHeader className="text-right sm:text-right"><DialogTitle>{editingProductId ? "تعديل المنتج" : "إضافة منتج جديد"}</DialogTitle><DialogDescription>أدخل اسم المنتج والمستهدف ووصفه، وأضف صفوف التفاصيل المناسبة.</DialogDescription></DialogHeader>
          {productDraft && <fieldset disabled={productSaving} className="grid gap-5">
            <label className="grid gap-2 text-sm font-bold">اسم المنتج<Input maxLength={120} className="h-11 rounded-xl" value={productDraft.name} onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })} /></label>
            <label className="grid gap-2 text-sm font-bold">المستهدف<Input maxLength={120} placeholder="مثل: 10 تقارير" className="h-11 rounded-xl" value={productDraft.target} onChange={(e) => setProductDraft({ ...productDraft, target: e.target.value })} /></label>
            <label className="grid gap-2 text-sm font-bold">وصف المنتج<Textarea maxLength={1200} className="rounded-xl" value={productDraft.description} onChange={(e) => setProductDraft({ ...productDraft, description: e.target.value })} /></label>
            <TaskDetailsEditor details={productDraft.details ?? []} disabled={productSaving} label="تفاصيل المنتج" users={assignmentUsers} ownerLabels={ownerLabels} onChange={(details) => setProductDraft({ ...productDraft, details })} />
          </fieldset>}
          <DialogFooter><Button disabled={productSaving} onClick={() => void saveProduct()}>{productSaving ? <Loader2 className="animate-spin" /> : <Check />}{editingProductId ? "حفظ التعديلات" : "إضافة المنتج"}</Button><Button variant="outline" disabled={productSaving} onClick={() => { setProductDraft(null); setEditingProductId(null); }}>إلغاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!viewingProduct} onOpenChange={(open) => { if (!open) setViewingProduct(null); }}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto rounded-3xl text-right sm:max-w-6xl">
          <DialogHeader className="text-right sm:text-right"><DialogTitle>{viewingProduct?.name}</DialogTitle><DialogDescription>{viewingProduct?.target || "تفاصيل المنتج"}</DialogDescription></DialogHeader>
          {viewingProduct && <><p className="whitespace-pre-wrap text-sm leading-7">{viewingProduct.description}</p><TaskDetailsReport ownerLabels={ownerLabels} label="تفاصيل المنتج" task={{ title: viewingProduct.name, details: viewingProduct.details }} /></>}
        </DialogContent>
      </Dialog>

      <Dialog open={(!!editing || creatingTask) && Boolean(userSession?.authenticated)} onOpenChange={(open) => { if (!open && !saving) { setEditing(null); setCreatingTask(false); setDraft(null); } }}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto rounded-3xl border-slate-200 text-right [&_[data-slot=dialog-close]]:right-auto [&_[data-slot=dialog-close]]:left-4 sm:max-w-6xl">
          <DialogHeader className="text-right sm:text-right"><DialogTitle className="text-xl font-black">{creatingTask ? "إضافة مهمة جديدة" : "تحديث المهمة"}</DialogTitle><DialogDescription className="leading-6">عدّل الإسناد والحالة ونسبة الإنجاز أو التوقيت، ثم احفظ التغييرات.</DialogDescription></DialogHeader>
          {draft && <div className="grid gap-5 py-2">
            {creatingTask && <label className="grid gap-2 text-sm font-bold">المنتج<Select dir="rtl" value={draft.productId} disabled={saving} onValueChange={(productId) => setDraft({ ...draft, productId, productName: products.find((p) => p.id === productId)?.name ?? "" })}><SelectTrigger className="h-11 w-full rounded-xl"><SelectValue placeholder="اختر المنتج" /></SelectTrigger><SelectContent dir="rtl">{visibleProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent></Select></label>}
            <label className="grid gap-2 text-sm font-bold">عنوان المهمة<Textarea disabled={saving || !canEditMain} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="min-h-24 rounded-xl text-base leading-7" /></label>
            <TaskDetailsEditor details={draft.details ?? []} users={assignmentUsers} ownerLabels={ownerLabels} canAssign={canAssign} canEditContent={Boolean(isAdmin)} canAdd={canEditMain && canAssign} editableDetailIds={creatingTask || userSession?.position === "system_admin" ? undefined : [...(draft.permissions?.editableDetailIds ?? []), ...(draft.details ?? []).filter((row) => !editing?.details?.some((old) => old.id === row.id)).map((row) => row.id)]} disabled={saving} onChange={(details) => setDraft((current) => current ? { ...current, details } : current)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold">الحالة<Select dir="rtl" disabled={saving || !canUpdateMain} value={draft.status} onValueChange={(value) => setDraft({ ...draft, status: value as TaskStatus, progress: progressForStatus(value as TaskStatus, draft.progress) })}><SelectTrigger className={`h-11 w-full rounded-xl text-right font-bold ${STATUS_COLORS[draft.status].badge}`}><SelectValue /></SelectTrigger><SelectContent dir="rtl">{STATUS_OPTIONS.map(([value, label]) => <SelectItem className={`my-1 rounded-lg ${STATUS_COLORS[value].badge}`} key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
              <label className="grid gap-2 text-sm font-bold">جهة الإسناد<Select dir="rtl" disabled={saving || !canEditMain} value={draft.ownerType} onValueChange={(value) => setDraft({ ...draft, ownerType: value })}><SelectTrigger className="h-11 w-full rounded-xl text-right"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{!ownerLabels[draft.ownerType] && <SelectItem value={draft.ownerType} disabled>{draft.ownerName ?? OWNER_LABELS[draft.ownerType] ?? "جهة محجوبة"}</SelectItem>}{OWNER_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
            </div>
            <label className="grid gap-2 text-sm font-bold">المستخدم المسند إليه<TaskAssigneeSelect users={assignmentUsers} email={draft.assigneeEmail} name={draft.assignee} disabled={saving || !canAssign || !canEditMain} onChange={(user) => setDraft({ ...draft, assigneeEmail: user?.email ?? "", assignee: user?.name ?? "", ...(user?.entityId ? { ownerType: user.entityId } : {}) })} /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">تاريخ البداية<Input type="date" disabled={saving || !canEditMain} value={draft.plannedDate} onChange={(event) => setDraft({ ...draft, plannedDate: event.target.value })} className="h-11 rounded-xl" /></label><label className="grid gap-2 text-sm font-bold">تاريخ النهاية<Input type="date" disabled={saving || !canEditMain} value={draft.endDate} min={draft.plannedDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} className="h-11 rounded-xl" /></label></div>
            <label className="grid gap-3 text-sm font-bold"><span className="flex items-center justify-between"><span>نسبة الإنجاز</span><strong className="text-lg text-[#116d7b]">{draft.progress}%</strong></span><Slider disabled={saving || !canUpdateMain || draft.status !== "blocked"} dir="rtl" min={0} max={100} step={5} value={[draft.progress]} onValueChange={(value) => setDraft({ ...draft, progress: value[0] })} className="[&_[data-slot=slider-range]]:bg-[#177f8f] [&_[data-slot=slider-thumb]]:border-[#177f8f]" /></label>
            <p className="-mt-2 text-xs leading-6 text-slate-500">تُحسب نسبة الإنجاز تلقائيًا حسب الحالة. يمكن تعديل آخر نسبة إنجاز للحالة المتعثرة.</p>
            <label className="grid gap-2 text-sm font-bold">ملاحظات التنفيذ<Textarea disabled={saving || !canUpdateMain} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="أضف آخر المستجدات أو العوائق أو تفاصيل التسليم..." className="min-h-28 rounded-xl text-base leading-7" /></label>
          </div>}
          <DialogFooter className="flex-row-reverse justify-start sm:justify-start"><Button className="h-11 rounded-xl bg-[#116d7b] px-6 hover:bg-[#0c5965]" onClick={() => void saveDraft()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Check />}{creatingTask ? "إضافة المهمة" : "حفظ التحديث"}</Button><Button variant="outline" className="h-11 rounded-xl" onClick={() => { setEditing(null); setCreatingTask(false); setDraft(null); }} disabled={saving}>إلغاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function MetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: number; note: string; icon: typeof ListChecks; tone: "teal" | "green" | "amber" | "red" }) {
  const styles = {
    teal: { frame: "border-teal-200 from-white to-teal-50", icon: "bg-teal-100 text-teal-800", ink: "text-teal-900", line: "border-t-teal-600" },
    green: { frame: "border-emerald-200 from-white to-emerald-50", icon: "bg-emerald-100 text-emerald-800", ink: "text-emerald-900", line: "border-t-emerald-600" },
    amber: { frame: "border-amber-200 from-white to-amber-50", icon: "bg-amber-100 text-amber-800", ink: "text-amber-900", line: "border-t-amber-600" },
    red: { frame: "border-red-200 from-white to-red-50", icon: "bg-red-100 text-red-800", ink: "text-red-900", line: "border-t-red-600" },
  }[tone];
  return <div className={`rounded-3xl border border-t-4 bg-gradient-to-br p-5 shadow-sm ${styles.frame} ${styles.line}`}><div className="flex items-start justify-between gap-3"><div><p className={`text-sm font-bold ${styles.ink}`}>{label}</p><p className={`mt-2 text-4xl font-black tabular-nums ${styles.ink}`}>{value}</p></div><div className={`grid size-11 shrink-0 place-items-center rounded-2xl ${styles.icon}`}><Icon aria-hidden="true" className="size-5" /></div></div><p className="mt-3 text-sm text-slate-600">{note}</p></div>;
}

function FilterSelect({ value, onValueChange, placeholder, options }: { value: string; onValueChange: (value: string) => void; placeholder: string; options: { value: string; label: string }[] }) {
  const colors = PRODUCT_COLORS[value];
  return <Select dir="rtl" value={value} onValueChange={onValueChange}><SelectTrigger aria-label={placeholder} className={`h-11 w-full rounded-xl border-slate-200 text-right ${STATUS_COLORS[value as TaskStatus]?.badge ?? ""}`} style={colors ? { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.border } : undefined}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent dir="rtl">{options.map((option) => <SelectItem key={option.value} value={option.value} className={`my-1 rounded-lg ${STATUS_COLORS[option.value as TaskStatus]?.badge ?? ""}`} style={PRODUCT_COLORS[option.value] ? { color: PRODUCT_COLORS[option.value].ink } : undefined}>{option.label}</SelectItem>)}</SelectContent></Select>;
}

function Timeline({ tasks, onOpen, ownerLabels }: { tasks: Task[]; onOpen: (task: Task) => void; ownerLabels: Record<string, string> }) {
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
    return <div key={month} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between bg-sky-950 px-5 py-4 text-white sm:px-6"><div><p className="text-sm font-bold text-sky-200">الشهر</p><h3 className="mt-1 text-xl font-black">{new Intl.DateTimeFormat("ar-SA", { month: "long", year: "numeric" }).format(monthDate)}</h3></div><span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{monthTasks.length} مهمة</span></div><div className="divide-y divide-slate-100">{monthTasks.map((task) => <button key={task.id} onClick={() => onOpen(task)} className="grid w-full gap-3 px-5 py-4 text-right transition hover:bg-slate-50 md:grid-cols-[105px_1fr_175px_120px] md:items-center sm:px-6"><div className="flex items-center gap-2 font-black text-slate-800"><span className="grid size-9 place-items-center rounded-xl border border-sky-200 bg-sky-50 text-sm text-sky-800">{parseDate(task.plannedDate).getDate()}</span><span className="text-sm text-slate-500">{new Intl.DateTimeFormat("ar-SA", { month: "short" }).format(parseDate(task.plannedDate))}</span></div><div><ProductPill task={task} /><p className="mt-1 font-bold leading-6">{task.title}</p></div><div className="text-sm"><p className="font-bold">{task.ownerName ?? ownerLabels[task.ownerType] ?? OWNER_LABELS[task.ownerType]}</p><p className="mt-1 text-slate-500">{task.assignee || "غير مسند لشخص"}</p></div><div><TimingPill task={task} /></div></button>)}</div></div>;
  })}</section>;
}
