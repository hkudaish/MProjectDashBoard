import { z } from "zod";
import { taskDetailsSchema } from "./task-details";
import type { Product } from "./types";

export const DEFAULT_PRODUCTS: Product[] = [
  { id: "digital", name: "المحتوى الرقمي", target: "188 بوست", description: "" },
  { id: "infographic", name: "الإنفوجرافيك", target: "13 منشوراً", description: "" },
  { id: "film", name: "الأفلام التوعوية", target: "3 أفلام", description: "" },
  { id: "report", name: "التقارير الاستراتيجية", target: "3 تقارير", description: "" },
];
export const productInputSchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم المنتج.").max(120),
  target: z.string().trim().max(120).default(""),
  description: z.string().trim().max(1200).default(""),
  details: taskDetailsSchema.default([]),
});
const date = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "أدخل تاريخًا صحيحًا.");
export const taskInputSchema = z.object({
  productId: z.string().trim().min(1, "اختر المنتج."),
  title: z.string().trim().min(1, "أدخل عنوان المهمة.").max(600),
  plannedDate: date, endDate: date,
  status: z.enum(["not_started", "in_progress", "review", "completed", "blocked"]).default("not_started"),
  progress: z.number().finite().min(0).max(100).default(0),
  ownerType: z.enum(["wamy", "vendor", "joint", "unassigned"]).default("unassigned"),
  assignee: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(1200).default(""),
  details: taskDetailsSchema.default([]),
}).refine((task) => task.endDate >= task.plannedDate, "تاريخ النهاية يجب ألا يسبق تاريخ البداية.");
