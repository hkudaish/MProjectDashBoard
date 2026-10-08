import { z } from "zod";

const completionDate = z.string().refine((value) => {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "تاريخ الإنجاز غير صحيح.");

export const taskDetailsSchema = z.array(z.object({
  id: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1, "أدخل وصفًا لكل مهمة تفصيلية.").max(1200, "وصف المهمة طويل جدًا."),
  status: z.enum(["not_started", "in_progress", "review", "completed", "blocked"]),
  completionDate,
  ownerType: z.string().trim().min(1).max(120),
  assigneeEmail: z.string().email().or(z.literal("")).optional(),
  assignee: z.string().trim().max(120, "اسم المسؤول المباشر طويل جدًا."),
})).refine((details) => new Set(details.map((detail) => detail.id)).size === details.length,
  "معرّفات المهام التفصيلية مكررة.");
