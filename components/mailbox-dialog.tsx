"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mail, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { InboxMessage, InboxDetail } from "@/lib/mailbox-types";

export function MailboxDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [detail, setDetail] = useState<InboxDetail | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [email, setEmail] = useState("hkudaish@gmail.com");
  const [before, setBefore] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const selection = useRef(0);
  const cancelReading = useCallback(() => { selection.current++; }, []);
  const load = useCallback(async (older?: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/mailbox${older ? `?pageToken=${encodeURIComponent(older)}` : ""}`, { cache: "no-store" });
      const data = await response.json() as { configured: boolean; email: string; messages: InboxMessage[]; nextPageToken: string | null; oauthReady?: boolean; error?: string };
      setOauthReady(Boolean(data.oauthReady));
      if (!response.ok) throw new Error(data.error || "تعذر تحميل البريد.");
      setConfigured(data.configured); setEmail(data.email); setBefore(data.nextPageToken);
      setMessages(current => older ? [...current, ...data.messages.filter(item => !current.some(previous => previous.id === item.id))] : data.messages);
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر تحميل البريد."); }
    finally { setLoading(false); }
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
    const timer = setTimeout(() => { setDetail(null); setReply(""); void load(); }, 0);
    return () => { clearTimeout(timer); cancelReading(); };
  }, [open, load, cancelReading]);
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
    setReading(true); setDetail(null); setReply(""); setError("");
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
      setReply(""); toast.success("تم إرسال الرد من بريدك.");
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر إرسال الرد."); }
    finally { setSending(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!sending) onOpenChange(value); }}><DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto rounded-3xl text-right sm:max-w-5xl">
    <DialogHeader className="sm:text-right"><DialogTitle className="flex items-center gap-2"><Mail className="size-5 text-teal-700" />البريد الإلكتروني</DialogTitle><DialogDescription>صندوق الوارد والرد على الرسائل من <span dir="ltr">{email}</span>. متاح لمدير النظام.</DialogDescription></DialogHeader>
    <div className="flex flex-wrap items-center justify-between gap-2"><p dir="ltr" className="text-sm font-bold text-teal-800">{email}</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!oauthReady || connecting || sending} onClick={() => void connect()}>{connecting ? "جارٍ الربط…" : configured ? "إعادة ربط Google" : "ربط حساب Google"}</Button><Button variant="outline" size="sm" disabled={loading || sending} onClick={() => void load()}><RefreshCw className="size-4" />تحديث البريد</Button></div></div>
    {configured === false && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-900">لإكمال الإرسال والاستقبال، اربط حساب Google ووافق على قراءة الرسائل وإرسال البريد.</p>}
    {configured === false && !oauthReady && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">بيانات Google OAuth لم تُضف بعد. تواصل مع مدير النظام لإكمال إعداد الربط.</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading && <p className="flex gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />جارٍ تحميل البريد…</p>}
    {configured && <div className="grid min-h-64 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="grid content-start gap-2">
        {messages.length === 0 && !loading && <p className="p-4 text-sm text-slate-500">صندوق الوارد فارغ.</p>}
        {messages.map(message => <button key={message.id} type="button" disabled={sending} onClick={() => void read(message.id)} className={`grid gap-1 rounded-xl border p-3 text-right transition hover:bg-teal-50 disabled:opacity-50 ${detail?.id === message.id ? "border-teal-400 bg-teal-50" : "border-slate-200"}`}><span className={`break-words text-sm ${message.unread ? "font-bold" : "font-medium"}`}>{message.subject}</span><span dir="auto" className="break-all text-xs text-slate-500">{message.from}</span>{message.date && <span className="text-xs text-slate-400">{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(new Date(message.date))}</span>}</button>)}
        {before && <Button variant="outline" disabled={loading || sending} onClick={() => void load(before)}>عرض رسائل أقدم</Button>}
      </div>
      <div className="min-w-0 rounded-2xl border border-slate-200 p-4">
        {reading ? <p className="text-sm text-slate-500">جارٍ قراءة الرسالة…</p> : detail ? <div className="grid gap-4"><h3 className="break-words font-bold text-slate-900">{detail.subject}</h3><p dir="auto" className="break-all text-sm text-slate-500">{detail.from}</p><pre dir="auto" className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-7">{detail.text}</pre><form onSubmit={send} className="grid gap-3 border-t border-slate-200 pt-4"><p className="text-xs text-slate-500">الرد إلى: <span dir="ltr">{detail.replyTo || "عنوان الرد غير متاح"}</span></p><label className="grid gap-2 text-sm font-bold">نص الرد<Textarea dir="auto" required disabled={sending || !detail.replyTo} maxLength={20000} value={reply} onChange={event => setReply(event.target.value)} className="min-h-32" /></label><Button type="submit" disabled={sending || !detail.replyTo || !reply.trim()}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}إرسال الرد</Button></form></div> : <p className="py-12 text-center text-sm text-slate-500">اختر رسالة لقراءتها والرد عليها.</p>}
      </div>
    </div>}
  </DialogContent></Dialog>;
}
