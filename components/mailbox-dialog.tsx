"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Inbox, Loader2, Mail, MailOpen, RefreshCw, Search, Send, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { displayMailSubject } from "@/lib/application-mail";
import type { InboxMessage, InboxDetail } from "@/lib/mailbox-types";
import type { RegistrationRequest } from "@/lib/registration-types";

type Notification = RegistrationRequest["notifications"][number] & { applicant: string; createdAt: string };
const NOTIFICATION_STATUS = {
  sent: { label: "تم الإرسال", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 },
  queued: { label: "بانتظار الإرسال", className: "bg-amber-50 text-amber-800 ring-amber-200", icon: Clock3 },
  failed: { label: "تعذر الإرسال", className: "bg-rose-50 text-rose-700 ring-rose-200", icon: AlertCircle },
};
function dateLabel(value: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date) : "—";
}
function Status({ status }: { status: Notification["status"] }) {
  const item = NOTIFICATION_STATUS[status], Icon = item.icon;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${item.className}`}><Icon className="size-3.5" />{item.label}</span>;
}

export function MailboxDialog({ embedded = false, open, onOpenChange }: { embedded?: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [detail, setDetail] = useState<InboxDetail | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [tab, setTab] = useState<"inbox" | "notifications">("inbox");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [email, setEmail] = useState("hkudaish@gmail.com");
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [notificationError, setNotificationError] = useState("");
  const selection = useRef(0), inboxLoad = useRef(0), notificationLoad = useRef(0);
  const cancelPending = useCallback(() => { selection.current++; inboxLoad.current++; notificationLoad.current++; }, []);
  const loadInbox = useCallback(async (older?: string) => {
    const version = ++inboxLoad.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/mailbox${older ? `?pageToken=${encodeURIComponent(older)}` : ""}`, { cache: "no-store" });
      const data = await response.json() as { configured: boolean; email: string; messages: InboxMessage[]; nextPageToken: string | null; oauthReady?: boolean; error?: string };
      if (inboxLoad.current !== version) return;
      setOauthReady(Boolean(data.oauthReady));
      if (!response.ok) throw new Error(data.error || "تعذر تحميل البريد.");
      setConfigured(data.configured); setEmail(data.email); setNextPage(data.nextPageToken);
      setMessages(current => older ? [...current, ...data.messages.filter(item => !current.some(previous => previous.id === item.id))] : data.messages);
    } catch (error) { if (inboxLoad.current === version) setError(error instanceof Error ? error.message : "تعذر تحميل البريد."); }
    finally { if (inboxLoad.current === version) setLoading(false); }
  }, []);
  const loadNotifications = useCallback(async () => {
    const version = ++notificationLoad.current;
    setLoadingNotifications(true); setNotificationError("");
    try {
      const response = await fetch("/api/registration-requests", { cache: "no-store" });
      const data = await response.json() as { requests: RegistrationRequest[]; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الإشعارات.");
      if (notificationLoad.current === version) {
        const items = data.requests.flatMap(request => request.notifications.map(item => ({ ...item, applicant: request.name, createdAt: request.createdAt })));
        setNotifications(items.sort((a, b) => Date.parse(b.sentAt || b.createdAt) - Date.parse(a.sentAt || a.createdAt)));
        setNotification(current => current ? items.find(item => item.id === current.id) ?? null : null);
      }
    } catch (error) { if (notificationLoad.current === version) setNotificationError(error instanceof Error ? error.message : "تعذر تحميل الإشعارات."); }
    finally { if (notificationLoad.current === version) setLoadingNotifications(false); }
  }, []);
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("gmail")) {
      if (params.get("gmail") === "connected") toast.success("تم ربط حساب Gmail.");
      else toast.error("لم يكتمل الربط. اختر الحساب الصحيح ووافق على الصلاحيات المطلوبة، ثم حاول مجددًا.");
      params.delete("gmail");
      window.history.replaceState(null, "", window.location.pathname + (params.size ? "?" + params : "") + window.location.hash);
    }
    const timer = setTimeout(() => { setDetail(null); setNotification(null); setReply(""); setReading(false); void loadInbox(); void loadNotifications(); }, 0);
    return () => { clearTimeout(timer); cancelPending(); };
  }, [open, loadInbox, loadNotifications, cancelPending]);
  async function connect() {
    setConnecting(true); setError("");
    try {
      const response = await fetch("/api/mailbox/connect", { method: "POST" });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "تعذر بدء الربط.");
      window.location.assign(data.url);
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر بدء الربط."); setConnecting(false); }
  }
  async function read(id: string) {
    const version = ++selection.current;
    setReading(true); setDetail(null); setNotification(null); setReply(""); setError("");
    try {
      const response = await fetch(`/api/mailbox?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json() as { message: InboxDetail; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر قراءة الرسالة.");
      if (selection.current === version) setDetail(data.message);
    } catch (error) { if (selection.current === version) setError(error instanceof Error ? error.message : "تعذر قراءة الرسالة."); }
    finally { if (selection.current === version) setReading(false); }
  }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return;
    setSending(true); setError("");
    try {
      const response = await fetch("/api/mailbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.id, text: reply }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر إرسال الرد.");
      setReply(""); toast.success("تم إرسال الرد من بريد التطبيق.");
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر إرسال الرد."); }
    finally { setSending(false); }
  }
  async function retry() {
    setRetrying(true); setNotificationError("");
    try {
      const response = await fetch("/api/registration-requests", { method: "PUT" });
      const data = await response.json() as { mailConfigured?: boolean; error?: string };
      if (!response.ok || !data.mailConfigured) throw new Error(data.error || "اربط خدمة البريد أولًا لإرسال الإشعارات.");
      await loadNotifications(); toast.success("تمت إعادة محاولة إرسال الإشعارات المعلقة.");
    } catch (error) { setNotificationError(error instanceof Error ? error.message : "تعذر إعادة الإرسال."); }
    finally { setRetrying(false); }
  }
  function changeTab(value: "inbox" | "notifications") {
    selection.current++; setReading(false); setTab(value); setQuery(""); setFilter("all"); setDetail(null); setNotification(null); setReply("");
  }
  const search = query.trim().toLocaleLowerCase();
  const visibleMessages = messages.filter(item => (filter !== "unread" || item.unread) && `${displayMailSubject(item.subject)} ${item.from} ${item.preview || ""}`.toLocaleLowerCase().includes(search));
  const visibleNotifications = notifications.filter(item => (filter === "all" || item.status === filter) && `${item.subject} ${item.to} ${item.applicant}`.toLocaleLowerCase().includes(search));
  const unread = messages.filter(item => item.unread).length;
  const pending = notifications.filter(item => item.status !== "sent").length;
  const busy = sending || retrying || connecting;
  const active = tab === "inbox" ? detail : notification;
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}><DialogContent embedded={embedded} style={embedded ? { height: "75dvh", minHeight: 560 } : undefined} dir="rtl" showCloseButton={false} className="flex h-[90vh] max-h-[900px] flex-col gap-0 overflow-hidden rounded-3xl border-slate-200 p-0 text-right sm:max-w-6xl">
    {!embedded && <Button variant="ghost" size="icon" aria-label="إغلاق البريد" disabled={busy} onClick={() => onOpenChange(false)} className="absolute left-3 right-auto top-3 size-8 rounded-full text-slate-500 hover:bg-white"><X className="size-4" /></Button>}
    <div className="border-b border-teal-100 bg-gradient-to-l from-teal-50 via-white to-sky-50 px-5 pb-5 pt-6 sm:px-7">
      <DialogHeader className="sm:text-right"><DialogTitle className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-teal-700 text-white shadow-sm"><Mail className="size-5" /></span><span>بريد التطبيق<span className="mt-1 block text-xs font-normal text-slate-500">متابعة منتجات المشروع الإعلامي</span></span></DialogTitle><DialogDescription className="mt-3 flex items-center gap-1.5 text-xs"><ShieldCheck className="size-4 text-teal-600" />مراسلات التطبيق وإشعاراته فقط · متاح لمدير النظام</DialogDescription></DialogHeader>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span dir="ltr" className="rounded-lg border border-teal-100 bg-white px-3 py-1.5 text-sm font-semibold text-teal-900">{email}</span><span role="status" className={`rounded-full px-2.5 py-1 text-xs font-bold ${error ? "bg-rose-100 text-rose-800" : configured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{error ? "تعذر الاتصال" : configured === null ? "جارٍ التحقق…" : configured ? "متصل بـ Gmail" : "بانتظار الربط"}</span></div><div className="flex gap-2"><Button variant="outline" size="sm" className="rounded-xl bg-white" disabled={!oauthReady || busy} onClick={() => void connect()}>{connecting && <Loader2 className="size-4 animate-spin" />}{connecting ? "جارٍ الربط…" : configured ? "إعادة ربط Google" : "ربط حساب Google"}</Button><Button variant="outline" size="sm" className="rounded-xl bg-white" disabled={loading || loadingNotifications || busy} onClick={() => { void loadInbox(); void loadNotifications(); }}><RefreshCw className={`size-4 ${loading || loadingNotifications ? "animate-spin" : ""}`} />تحديث</Button></div></div>
    </div>
    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-white px-5 py-3 sm:px-7"><div className="rounded-xl bg-sky-50 p-3"><p className="text-lg font-black text-sky-800">{messages.length}</p><p className="text-[11px] text-sky-700">رسائل واردة محملة</p></div><div className="rounded-xl bg-teal-50 p-3"><p className="text-lg font-black text-teal-800">{unread}</p><p className="text-[11px] text-teal-700">رسائل محملة غير مقروءة</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-lg font-black text-amber-800">{pending}</p><p className="text-[11px] text-amber-800">إشعارات معلقة</p></div></div>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/60">
      <div className="px-5 pt-4 sm:px-7">
        <div role="tablist" aria-label="أقسام بريد التطبيق" className="flex gap-1 rounded-xl bg-slate-100 p-1"><button type="button" id="mail-inbox-tab" role="tab" aria-selected={tab === "inbox"} aria-controls="mail-content" disabled={busy} onClick={() => changeTab("inbox")} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${tab === "inbox" ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"}`}><Inbox className="size-4" />الوارد{unread > 0 && <span className="rounded-full bg-teal-100 px-2 text-xs text-teal-800">{unread}</span>}</button><button type="button" id="mail-notifications-tab" role="tab" aria-selected={tab === "notifications"} aria-controls="mail-content" disabled={busy} onClick={() => changeTab("notifications")} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${tab === "notifications" ? "bg-white text-sky-800 shadow-sm" : "text-slate-500"}`}><Send className="size-4" />الإشعارات الصادرة</button></div>
        <div className="my-3 flex flex-wrap gap-2"><div className="relative min-w-40 flex-1"><Search className="pointer-events-none absolute end-3 top-3 size-4 text-slate-400" /><Input aria-label={tab === "inbox" ? "بحث ضمن الرسائل المحملة" : "بحث في إشعارات التطبيق"} className="h-10 rounded-xl bg-white pe-10" placeholder={tab === "inbox" ? "ابحث ضمن الرسائل المحملة…" : "ابحث في العنوان أو المستلم…"} value={query} onChange={event => setQuery(event.target.value)} /></div><select aria-label="فلترة الرسائل" value={filter} onChange={event => setFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600"><option value="all">{tab === "inbox" ? "كل الرسائل" : "كل الحالات"}</option>{tab === "inbox" ? <option value="unread">غير المقروءة</option> : Object.entries(NOTIFICATION_STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select>{tab === "notifications" && pending > 0 && <Button variant="outline" className="h-10 rounded-xl border-amber-200 text-amber-800" disabled={busy || !configured} onClick={() => void retry()}>{retrying ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}إعادة محاولة الإرسال</Button>}</div>
        {configured === false && tab === "inbox" && <p role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-900">{oauthReady ? "اربط حساب Google لعرض مراسلات التطبيق والرد عليها." : "بيانات Google OAuth لم تُضف بعد. أكمل إعداد الربط لدى مدير النظام."}</p>}
        {(tab === "inbox" ? error : notificationError) && <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 size-4 shrink-0" />{tab === "inbox" ? error : notificationError}</p>}
      </div>
      <div id="mail-content" role="tabpanel" aria-labelledby={tab === "inbox" ? "mail-inbox-tab" : "mail-notifications-tab"} className="grid flex-1 gap-4 px-5 pb-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.7fr)] sm:px-7">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2">
          <p className="px-2 py-2 text-xs font-semibold text-slate-500">{tab === "inbox" ? `${visibleMessages.length} رسالة ضمن النتائج المحملة` : `${visibleNotifications.length} إشعار`}</p>
          {(tab === "inbox" ? loading : loadingNotifications) && <p role="status" className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />جارٍ تحميل {tab === "inbox" ? "الرسائل" : "الإشعارات"}…</p>}
          {tab === "inbox" ? <>{visibleMessages.map(message => <button key={message.id} type="button" aria-pressed={detail?.id === message.id} disabled={busy} onClick={() => void read(message.id)} className={`mb-1 grid w-full gap-2 rounded-xl border p-3 text-right transition hover:border-teal-200 hover:bg-teal-50/60 disabled:opacity-50 ${detail?.id === message.id ? "border-teal-300 bg-teal-50" : "border-transparent"}`}><span className="flex items-start gap-2"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${message.unread ? "bg-teal-600" : "bg-slate-200"}`} /><span className={`break-words text-sm leading-6 ${message.unread ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>{displayMailSubject(message.subject)}</span></span><span dir="auto" className="truncate text-xs text-slate-500">{message.from}</span>{message.preview && <span dir="auto" className="line-clamp-2 break-words text-xs leading-5 text-slate-400">{message.preview}</span>}<span className="text-[11px] text-slate-400">{dateLabel(message.date)}</span></button>)}{visibleMessages.length === 0 && !loading && !error && <div className="grid justify-items-center gap-2 px-4 py-10 text-center"><Inbox className="size-9 text-teal-200" /><p className="text-sm font-bold text-slate-600">{query || filter !== "all" ? "لا توجد نتائج مطابقة" : "لا توجد مراسلات واردة للتطبيق"}</p><p className="text-xs leading-6 text-slate-400">{query || filter !== "all" ? "غيّر البحث أو الفلتر، أو حمّل رسائل أقدم." : "ستظهر هنا رسائل التطبيق والردود على إشعاراته."}</p></div>}{nextPage && <Button variant="ghost" className="mt-2 w-full rounded-xl text-teal-700" disabled={loading || busy} onClick={() => void loadInbox(nextPage)}>تحميل رسائل أقدم</Button>}</> : <>{visibleNotifications.map(item => <button key={item.id} type="button" aria-pressed={notification?.id === item.id} disabled={busy} onClick={() => setNotification(item)} className={`mb-1 grid w-full gap-2 rounded-xl border p-3 text-right transition hover:bg-sky-50 disabled:opacity-50 ${notification?.id === item.id ? "border-sky-300 bg-sky-50" : "border-transparent"}`}><span className="break-words text-sm font-bold text-slate-800">{item.subject}</span><span dir="ltr" className="truncate text-right text-xs text-slate-500">{item.to}</span><span className="flex flex-wrap items-center justify-between gap-2"><Status status={item.status} /><span className="text-[10px] text-slate-400">{dateLabel(item.sentAt || item.createdAt)}</span></span></button>)}{visibleNotifications.length === 0 && !loadingNotifications && !notificationError && <div className="grid justify-items-center gap-2 p-10 text-center"><Send className="size-9 text-sky-200" /><p className="text-sm font-bold text-slate-600">{query || filter !== "all" ? "لا توجد نتائج مطابقة" : "لا توجد إشعارات صادرة بعد"}</p><p className="text-xs leading-6 text-slate-400">تظهر هنا إشعارات طلبات التسجيل والموافقة والتفعيل.</p></div>}</>}
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
          {tab === "inbox" && reading ? <div role="status" className="flex h-64 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="size-5 animate-spin" />جارٍ فتح الرسالة…</div> : active ? <div className="grid gap-5"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="break-words text-lg font-bold leading-8 text-slate-900">{displayMailSubject(active.subject)}</h3>{tab === "notifications" && notification && <Status status={notification.status} />}</div><dl className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2"><div><dt className="mb-1 text-xs text-slate-400">{tab === "inbox" ? "المرسل" : "المستلم"}</dt><dd dir="auto" className="break-all text-slate-700">{tab === "inbox" && detail ? detail.from : notification?.to}</dd></div><div><dt className="mb-1 text-xs text-slate-400">التاريخ · توقيت الرياض</dt><dd className="text-slate-700">{dateLabel(tab === "inbox" && detail ? detail.date : notification?.sentAt || notification?.createdAt || null)}</dd></div></dl><pre dir="auto" className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-8 text-slate-700">{active.text}</pre>{tab === "inbox" && detail && <form onSubmit={send} className="grid gap-3 border-t border-slate-100 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="application-mail-reply" className="text-sm font-bold text-teal-900">الرد على الرسالة</label><span className="text-xs text-slate-400">إلى: <span dir="ltr">{detail.replyTo || "عنوان الرد غير متاح"}</span></span></div><Textarea id="application-mail-reply" dir="auto" required disabled={busy || !detail.replyTo} maxLength={20000} value={reply} placeholder="اكتب ردك هنا…" onChange={event => setReply(event.target.value)} className="min-h-32 rounded-xl border-slate-200 bg-slate-50/60 focus-visible:ring-teal-500" /><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-400">سيُرسل الرد من بريد التطبيق.</span><Button type="submit" className="rounded-xl bg-teal-700 text-white hover:bg-teal-800" disabled={busy || !detail.replyTo || !reply.trim()}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}إرسال الرد</Button></div></form>}</div> : <div className="grid min-h-80 content-center justify-items-center gap-3 text-center"><span className={`grid size-20 place-items-center rounded-3xl ${tab === "inbox" ? "bg-teal-50 text-teal-300" : "bg-sky-50 text-sky-300"}`}>{tab === "inbox" ? <MailOpen className="size-9" /> : <Send className="size-9" />}</span><p className="font-bold text-slate-700">{tab === "inbox" ? "اختر رسالة لعرض محتواها" : "اختر إشعارًا لعرض تفاصيله"}</p><p className="max-w-xs text-sm leading-7 text-slate-400">{tab === "inbox" ? "تابع مراسلات التطبيق وردّ عليها من مكان واحد." : "راجع المستلم ونص الإشعار وحالة إرساله."}</p></div>}
        </div>
      </div>
    </div>
  </DialogContent></Dialog>;
}
