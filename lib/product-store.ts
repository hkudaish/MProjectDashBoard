import { getStore } from "@netlify/blobs";
import { getLocalStore } from "./local-store";
import { DEFAULT_PRODUCTS, productInputSchema } from "./products";
import type { Product } from "./types";

const memory = new Map<string, Product>();
export function createProductStore() {
  const store = getLocalStore() ?? (process.env.NODE_ENV === "production" && process.env.TASK_STORE_MODE !== "memory"
    ? getStore("wamy-task-dashboard", { consistency: "strong" }) : null);
  return {
    async getProducts(): Promise<Product[]> {
      const raw = store ? await store.get("products", { type: "json" }) : [...memory.values()];
      const products = new Map<string, Product>(DEFAULT_PRODUCTS.map((product) => [product.id, product]));
      if (Array.isArray(raw)) for (const item of raw) {
        if (typeof item.id === "string" && item.deleted === true) { products.delete(item.id); continue; }
        const parsed = productInputSchema.safeParse(item);
        if (parsed.success && typeof item.id === "string" && item.id)
          products.set(item.id, { id: item.id, ...parsed.data });
      }
      return [...products.values()];
    },
    async setProducts(products: Product[]) {
      const previous = store ? await store.get("products", { type: "json" }) : [...memory.values()];
      const tombstones = Array.isArray(previous) ? previous.filter(item => item.deleted === true && !products.some(value => value.id === item.id)) : [];
      const next = [...tombstones, ...products];
      if (store) await store.setJSON("products", next); else { memory.clear(); for (const item of next) memory.set(item.id, item); }
    },
  };
}
