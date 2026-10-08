import { z } from "zod";
import { hasSameOrigin } from "@/lib/admin-auth";
import { emailSchema, requestPasswordReset } from "@/lib/user-accounts";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return Response.json({ error: "الطلب غير صالح." }, { status: 403 });
  const parsed = z.object({ email: emailSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "أدخل بريدًا إلكترونيًا صالحًا." }, { status: 400 });
  try {
    await requestPasswordReset(parsed.data.email);
    return Response.json({ message: "إذا كان البريد مسجلًا لحساب نشط، سيظهر طلبك لدى مسؤول النظام. تواصل معه لاستلام كلمة المرور المؤقتة." }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "تعذر إرسال الطلب. حاول مرة أخرى." }, { status: 503 }); }
}
