import { z } from "zod";
import { DEFAULT_PROJECT_ID } from "./products";
import type { Project } from "./types";
export const DEFAULT_PROJECT: Project = { id: DEFAULT_PROJECT_ID, name: "المشروع الإعلامي", description: "" };
export const projectInputSchema = z.object({ name: z.string().trim().min(1, "أدخل اسم المشروع.").max(120), description: z.string().trim().max(1200).default("") });
