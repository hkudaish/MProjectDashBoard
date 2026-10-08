import { getAdminSession } from "@/lib/admin-auth";
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
    const store = createProductStore();
    const products = await store.getProducts();
    if (products.some((product) => product.name.normalize("NFKC") === parsed.data.name.normalize("NFKC")))
      return Response.json({ error: "يوجد منتج بهذا الاسم بالفعل." }, { status: 409 });
    const product = { id: crypto.randomUUID(), ...parsed.data };
    await store.setProducts([...products, product]);
    return Response.json({ product }, { status: 201 });
  } catch { return Response.json({ error: "تعذر حفظ المنتج." }, { status: 500 }); }
}
