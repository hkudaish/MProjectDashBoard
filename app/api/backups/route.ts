import { z } from "zod";
import { getSystemAdminSession, hasSameOrigin, clearedAdminSessionCookie } from "@/lib/admin-auth";
import { BackupError, MAX_BACKUP_BYTES } from "@/lib/backup-format";
import { listBackups, downloadBackup, createBackup, previewRestore, restoreBackup } from "@/lib/backups";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const password = z.string().min(12).max(128);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), password }).strict(),
  z.object({ action: z.literal("preview"), file: z.unknown(), password }).strict(),
  z.object({ action: z.literal("restore"), file: z.unknown(), password, token: z.string().min(1).max(4096), confirmation: z.literal("استعادة"), loginEmail: z.string().email().max(254), loginPassword: z.string().min(1).max(254) }).strict(),
]);
function failure(error: unknown) {
  if (error instanceof BackupError) return Response.json({ error: error.message }, { status: 400, headers });
  console.error("Backup operation failed", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ error: "تعذر إتمام العملية. أعد تحميل الصفحة وتحقق من حالة البيانات قبل المحاولة مجددًا." }, { status: 503, headers });
}
export async function GET(request: Request) {
  if (!await getSystemAdminSession(request.headers)) return Response.json({ error: "النسخ الاحتياطي متاح لمدير النظام فقط." }, { status: 403, headers });
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ backups: await listBackups(), maxBytes: MAX_BACKUP_BYTES }, { headers });
    const { file, entry } = await downloadBackup(id);
    return Response.json(file, { headers: { ...headers, "Content-Disposition": `attachment; filename="mproject-backup-${entry.createdAt.replace(/[:.]/g, "-")}.json"` } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const actor = await getSystemAdminSession(request.headers);
  if (!actor || !hasSameOrigin(request)) return Response.json({ error: "العملية متاحة لمدير النظام من نفس الموقع فقط." }, { status: 403, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new BackupError("الطلب فارغ.");
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > MAX_BACKUP_BYTES) { await reader.cancel(); return Response.json({ error: "الحد الأقصى للملف 4 ميجابايت." }, { status: 413, headers }); } chunks.push(next.value); }
    let raw: unknown; try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new BackupError("الطلب ليس ملف JSON صالحًا."); }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new BackupError("أكمل جميع الحقول المطلوبة بكلمات مرور صالحة.");
    const input = parsed.data;
    if (input.action === "create") return Response.json({ backup: await createBackup(actor, input.password) }, { status: 201, headers });
    if (input.action === "preview") return Response.json(await previewRestore(actor, input.file, input.password), { headers });
    const result = await restoreBackup(actor, { ...input, file: input.file });
    return Response.json(result, { headers: { ...headers, "Set-Cookie": clearedAdminSessionCookie() } });
  } catch (error) { return failure(error); }
}
