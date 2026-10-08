import { getStore } from "@netlify/blobs";
import { DEFAULT_PRODUCTS, productInputSchema } from "./products";
import type { Product } from "./types";

const memory = new Map<string, Product>();
export function createProductStore() {
  const store = process.env.NODE_ENV === "production" && process.env.TASK_STORE_MODE !== "memory"
    ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null;
  return {
    async getProducts(): Promise<Product[]> {
      const raw = store ? await store.get("products", { type: "json" }) : [...memory.values()];
      const products = new Map<string, Product>(DEFAULT_PRODUCTS.map((product) => [product.id, product]));
      if (Array.isArray(raw)) for (const item of raw) {
        const parsed = productInputSchema.safeParse(item);
        if (parsed.success && typeof item.id === "string" && item.id)
          products.set(item.id, { id: item.id, ...parsed.data });
      }
      return [...products.values()];
    },
    async setProducts(products: Product[]) {
      if (store) await store.setJSON("products", products);
      else { memory.clear(); for (const product of products) memory.set(product.id, product); }
    },
  };
}
