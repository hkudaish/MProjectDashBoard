"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, MessageCircle, Send, Shield, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { POSITIONS, type SessionInfo, type Position } from "@/lib/user-types";
import type { ChatContact, ChatMessage } from "@/lib/chat-types";
function date(value: string) { return new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)); }
async function api(path: string, method = "GET", body?: object) { const response = await fetch(path, { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }); const data = await response.json() as { error?: string; contacts: ChatContact[]; unread: number; messages: ChatMessage[]; message?: ChatMessage; currentUser?: { name: string } }; if (!response.ok) throw new Error(data.error || "تعذر تنفيذ العملية."); return data; }
export function ChatPanel({ session }: { session: SessionInfo | null }) {
  const enabled = Boolean(session?.authenticated && !session.mustChangePassword);
  const [open, setOpen] = useState(false), [contacts, setContacts] = useState<ChatContact[]>([]), [unread, setUnread] = useState(0);
  const [currentName, setCurrentName] = useState("");
  const [peer, setPeer] = useState(""), [messages, setMessages] = useState<ChatMessage[]>([]), [supervise, setSupervise] = useState(false);
  const [text, setText] = useState(""), [editing, setEditing] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const end = useRef<HTMLDivElement>(null), generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const overview = useCallback(async () => { if (!enabled) return; const data = await api("/api/chat"); setContacts(data.contacts); setUnread(data.unread); if (data.currentUser?.name) setCurrentName(data.currentUser.name); }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function refresh() { try { const data = await api("/api/chat"); if (!cancelled) { setContacts(data.contacts); setUnread(data.unread); if (data.currentUser?.name) setCurrentName(data.currentUser.name); } } catch { /* Retry automatically; no private data is shown on failure. */ } }
    void refresh(); const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 8000);
    const focus = () => void refresh(); window.addEventListener("focus", focus);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [enabled, session?.email]);
  const load = useCallback(async () => {
    if (!enabled || !open || (!peer && !supervise)) return;
    const version = generation.current;
    const data = await api(supervise ? "/api/chat?supervise=1" : (peer === "all" ? "/api/chat?broadcast=1" : `/api/chat?peer=${encodeURIComponent(peer)}`));
    if (version !== generation.current) return;
    setMessages(data.messages); if (!supervise) { setContacts(data.contacts); setUnread(data.unread); if (data.currentUser?.name) setCurrentName(data.currentUser.name); }
    if (!supervise && peer !== "all" && data.messages.some((m: ChatMessage) => m.recipient === session?.email && !m.readAt && !m.recalledAt && !m.removedAt) && document.visibilityState === "visible" && document.hasFocus()) { await api("/api/chat", "PUT", { peer }); await overview(); }
  }, [enabled, open, peer, supervise, session?.email, overview]);
  useEffect(() => {
    invalidate();
    if (!open || !enabled) return;
    let cancelled = false;
    async function refresh() { try { await load(); } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : "تعذر تحميل المحادثة."); } }
    void refresh(); const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 4000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { cancelled = true; invalidate(); clearInterval(timer); clearInterval(tick); };
  }, [open, enabled, load, invalidate]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, peer]);
  async function action(body: object) { setBusy(true); setError(""); try { await api("/api/chat", "PATCH", body); await load(); await overview(); } catch (error) { setError(error instanceof Error ? error.message : "تعذر تنفيذ العملية."); } finally { setBusy(false); } }
  async function send(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { if (editing) await api("/api/chat", "PATCH", { id: editing, action: "edit", text }); else { const sent = await api("/api/chat", "POST", { recipient: peer, text }); if (peer === "all") toast.success(`تم إرسال الرسالة إلى ${sent.message?.broadcastCount ?? 0} مستخدم.`); } setText(""); setEditing(null); await load(); await overview(); } catch (error) { setError(error instanceof Error ? error.message : "تعذر إرسال الرسالة."); } finally { setBusy(false); } }
  function select(value: string, inspect = false) { generation.current++; setPeer(value); setSupervise(inspect); setMessages([]); setText(""); setEditing(null); setError(""); }
  if (!enabled) return null;
  const selected = contacts.find(contact => contact.email === peer);
  return <><Button variant="outline" className="relative rounded-xl border-teal-100 text-teal-900" aria-label={`المحادثات، ${unread} رسالة غير مقروءة`} onClick={() => setOpen(true)}><Bell className="size-4" /><span className="hidden sm:inline">المحادثات</span>{unread > 0 && <span aria-live="polite" className="absolute -end-2 -top-2 min-w-5 rounded-full bg-rose-600 px-1 text-xs font-bold text-white">{unread > 99 ? "99+" : unread}</span>}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) { generation.current++; setOpen(value); } }}><DialogContent dir="rtl" showCloseButton={false} className="flex h-[88vh] max-h-[850px] flex-col gap-0 overflow-hidden rounded-3xl p-0 text-right sm:max-w-5xl">
      <DialogHeader className="border-b bg-teal-800 px-5 py-4 text-white sm:text-right"><div className="flex items-center justify-between gap-3"><DialogTitle className="flex items-center gap-2"><MessageCircle />المحادثات</DialogTitle><Button aria-label="إغلاق المحادثات" variant="ghost" size="icon" disabled={busy} onClick={() => { generation.current++; setOpen(false); }}><X /></Button></div><DialogDescription className="text-teal-100">رسائل نصية داخل التطبيق · يمكن لمدير النظام الاطلاع عليها وحذفها.</DialogDescription></DialogHeader>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] md:grid-cols-[270px_1fr] md:grid-rows-1">
        <aside className="max-h-44 overflow-y-auto border-b bg-white p-3 md:max-h-none md:border-b-0 md:border-e"><p className="mb-2 text-xs font-bold text-slate-500">المستخدمون</p>{session?.canManageUsers && <><div className="mb-2 rounded-xl bg-teal-50 p-3 text-sm font-bold text-teal-900"><Shield className="me-1 inline size-4" />{currentName || "مدير النظام"}<span className="ms-1 text-xs">· أنت · مدير النظام</span></div><Button disabled={busy} variant="outline" className={`mb-2 w-full rounded-xl ${peer === "all" && !supervise ? "border-teal-400 bg-teal-50 text-teal-900" : ""}`} onClick={() => select("all")}><Users className="size-4" />رسالة جماعية للجميع</Button></>}{contacts.map(contact => <button disabled={busy} key={contact.email} onClick={() => select(contact.email)} className={`mb-1 flex w-full items-center justify-between gap-2 rounded-xl p-3 text-right ${peer === contact.email && !supervise ? "bg-teal-50 text-teal-900" : "hover:bg-slate-50"}`}><span><span className="block text-sm font-bold">{contact.name}{contact.position === "system_admin" && <Shield className="ms-1 inline size-3.5 text-teal-700" />}</span><span className="text-xs text-slate-500">{contact.position ? POSITIONS[contact.position as Position] : "مستخدم"}</span></span>{contact.unread > 0 && <span className="rounded-full bg-teal-600 px-2 text-xs text-white">{contact.unread}</span>}</button>)}{contacts.length === 0 && <p className="p-3 text-sm text-slate-500">لا يوجد مستخدمون آخرون متاحون.</p>}{session?.canManageUsers && <Button variant="outline" disabled={busy} className="mt-3 w-full rounded-xl" onClick={() => select("", true)}><Shield />الإشراف على الرسائل</Button>}</aside>
        <section className="flex min-h-0 min-w-0 flex-col bg-[#eaf1ec]">
          <div className="border-b bg-white/90 px-5 py-3"><h3 className="font-bold text-teal-900">{supervise ? "رسائل المستخدمين — إشراف مدير النظام" : peer === "all" ? "رسالة جماعية لجميع المستخدمين" : selected?.position === "system_admin" ? `${selected.name} · مدير النظام` : selected?.name || "اختر مستخدمًا لبدء المحادثة"}</h3><p className="mt-1 text-xs text-slate-500">{peer === "all" ? "تصل الرسالة إلى كل مستخدم نشط في محادثته معك، ويمكنه الرد عليك بشكل خاص." : "التعديل والتراجع خلال دقيقة · الحذف العادي من نسختك فقط"}</p></div>
          {error && <p role="alert" className="bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{messages.map(message => { const mine = message.sender === session?.email; const editable = mine && now - Date.parse(message.createdAt) < 60000 && !message.recalledAt && !message.removedAt; return <div key={message.id} className={`mb-3 flex ${mine && !supervise ? "justify-start" : "justify-end"}`}><article className={`max-w-[90%] rounded-2xl p-3 shadow-sm sm:max-w-[75%] ${mine && !supervise ? "bg-[#d7f7da]" : "bg-white"}`}>{supervise && <p className="mb-2 break-all text-xs font-bold text-teal-800">{contacts.find(u => u.email === message.sender)?.name || message.sender} ← {contacts.find(u => u.email === message.recipient)?.name || message.recipient}</p>}{message.broadcastId && <p className="mb-1 text-[10px] font-bold text-teal-800">رسالة جماعية{message.broadcastCount ? ` · ${message.broadcastCount} مستخدم` : ""}</p>}<p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-7">{message.removedAt ? "حُذفت الرسالة بواسطة مدير النظام" : message.recalledAt ? "تم التراجع عن إرسال الرسالة" : message.text}</p><div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500"><span>{date(message.createdAt)}</span>{message.editedAt && <span>معدّلة</span>}{mine && !supervise && (message.readAt ? <CheckCheck aria-label="مقروءة" className="size-3.5 text-sky-600" /> : <Check aria-label="مرسلة" className="size-3.5" />)}</div><div className="mt-2 flex flex-wrap gap-2">{!supervise && editable && <><button disabled={busy} className="text-xs text-teal-800 underline" onClick={() => { setEditing(message.id); setText(message.text); }}>{message.broadcastId ? "تعديل للجميع" : "تعديل"}</button><button disabled={busy} className="text-xs text-amber-800 underline" onClick={() => void action({ id: message.id, action: "recall" })}>{message.broadcastId ? "تراجع للجميع" : "تراجع عن الإرسال"}</button></>}{!supervise && <button disabled={busy} className="text-xs text-slate-500 underline" onClick={() => void action({ id: message.id, action: "delete" })}>حذف لدي</button>}{supervise && !message.removedAt && <Button variant="ghost" size="sm" disabled={busy} className="h-6 text-rose-700" onClick={() => { if (window.confirm("حذف هذه الرسالة لدى جميع المستخدمين؟")) void action({ id: message.id, action: "remove" }); }}><Trash2 className="size-3" />حذف للجميع</Button>}</div></article></div>; })}{(peer || supervise) && messages.length === 0 && <p className="py-12 text-center text-sm text-slate-500">لا توجد رسائل بعد.</p>}<div ref={end} /></div>
          {peer && !supervise && <form onSubmit={send} className="border-t bg-white p-3">{editing && <div className="mb-2 flex justify-between text-xs text-teal-800"><span>تعديل الرسالة خلال دقيقة من إرسالها</span><button type="button" onClick={() => { setEditing(null); setText(""); }}>إلغاء التعديل</button></div>}<div className="flex items-end gap-2"><Textarea aria-label="نص الرسالة" dir="auto" value={text} disabled={busy} maxLength={4000} required placeholder="اكتب رسالة…" className="min-h-12 max-h-32 rounded-2xl bg-slate-50" onChange={event => setText(event.target.value)} /><Button aria-label={editing ? "حفظ تعديل الرسالة" : "إرسال الرسالة"} disabled={busy || !text.trim()} type="submit" className="size-11 rounded-full bg-teal-700"><Send /></Button></div></form>}
        </section>
      </div>
    </DialogContent></Dialog>
  </>;
}
