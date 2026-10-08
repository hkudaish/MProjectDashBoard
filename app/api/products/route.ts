import { getAdminSession, getSystemAdminSession, hasSameOrigin } from "@/lib/admin-auth";
import { createProjectStore } from "@/lib/project-store";
import { z } from "zod";
import { DEFAULT_PROJECT_ID } from "@/lib/products";
import { createProductStore } from "@/lib/product-store";
import { productInputSchema } from "@/lib/products";

export async function GET() {
  try { return Response.json({ products: await createProductStore().getProducts() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "تعذر تحميل المنتجات." }, { status: 500 }); }
}
export async function POST(request: Request) {
  if (!(await getAdminSession(request.headers))) return Response.json({ error: "يجب تسجيل الدخول بحساب مسؤول." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = productInputSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    if (!(await createProjectStore().getProjects()).some((p) => p.id === parsed.data.projectId)) return Response.json({ error: "المشروع المحدد غير موجود." }, { status: 400 });
    const store = createProductStore();
    const products = await store.getProducts();
    if (products.some((product) => (product.projectId ?? DEFAULT_PROJECT_ID) === parsed.data.projectId && product.name.normalize("NFKC") === parsed.data.name.normalize("NFKC")))
      return Response.json({ error: "يوجد منتج بهذا الاسم بالفعل." }, { status: 409 });
    const product = { id: crypto.randomUUID(), ...parsed.data };
    await store.setProducts([...products, product]);
    return Response.json({ product }, { status: 201 });
  } catch { return Response.json({ error: "تعذر حفظ المنتج." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  if (!hasSameOrigin(request) || !(await getSystemAdminSession(request.headers))) return Response.json({ error: "تعديل المنتجات متاح لمسؤول النظام فقط." }, { status: 403 });
  const parsed = productInputSchema.omit({ projectId: true }).partial().extend({ id: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const store = createProductStore(); const products = await store.getProducts();
    const index = products.findIndex((p) => p.id === parsed.data.id);
    if (index < 0) return Response.json({ error: "المنتج غير موجود." }, { status: 404 });
    const product = { ...products[index], ...parsed.data };
    if (products.some((p) => p.id !== product.id && (p.projectId ?? DEFAULT_PROJECT_ID) === (product.projectId ?? DEFAULT_PROJECT_ID) && p.name.normalize("NFKC") === product.name.normalize("NFKC"))) return Response.json({ error: "يوجد منتج بهذا الاسم في المشروع بالفعل." }, { status: 409 });
    products[index] = product; await store.setProducts(products); return Response.json({ product });
  } catch { return Response.json({ error: "تعذر تعديل المنتج." }, { status: 500 }); }
}
