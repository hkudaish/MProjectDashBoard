import type { TaskStatus } from "./types";

export const STATUS_COLORS: Record<TaskStatus, { badge: string; progress: string }> = {
  not_started: { badge: "border-slate-200 bg-slate-100 text-slate-700", progress: "[&_[data-slot=progress-indicator]]:bg-slate-500" },
  in_progress: { badge: "border-sky-200 bg-sky-50 text-sky-800", progress: "[&_[data-slot=progress-indicator]]:bg-sky-600" },
  review: { badge: "border-violet-200 bg-violet-50 text-violet-800", progress: "[&_[data-slot=progress-indicator]]:bg-violet-600" },
  completed: { badge: "border-emerald-200 bg-emerald-50 text-emerald-800", progress: "[&_[data-slot=progress-indicator]]:bg-emerald-600" },
  blocked: { badge: "border-red-200 bg-red-50 text-red-800", progress: "[&_[data-slot=progress-indicator]]:bg-red-600" },
};

export const PRODUCT_COLORS: Record<string, { ink: string; surface: string; border: string; accent: string }> = {
  digital: { ink: "#115e59", surface: "#f0fdfa", border: "#99f6e4", accent: "#0f766e" },
  infographic: { ink: "#854d0e", surface: "#fefce8", border: "#fde68a", accent: "#a16207" },
  film: { ink: "#3730a3", surface: "#eef2ff", border: "#c7d2fe", accent: "#4f46e5" },
  report: { ink: "#6b21a8", surface: "#faf5ff", border: "#e9d5ff", accent: "#7e22ce" },
};

export function productColors(productId: string) {
  return PRODUCT_COLORS[productId] ?? { ink: "#334155", surface: "#f8fafc", border: "#cbd5e1", accent: "#475569" };
}