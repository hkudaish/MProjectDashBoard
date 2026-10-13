import { permitted } from "./permissions";
import type { SessionInfo } from "./user-types";
export const SETTINGS_SECTIONS = {
  account: { label: "الحساب الحالي", description: "بيانات حسابك والمنصب والجهة والمشروع المرتبط به." },
  permissions: { label: "صلاحيات المستخدمين", description: "تحديد صلاحيات إدارة المشاريع والمنتجات والمهام لكل مستخدم." },
  projects: { label: "إضافة مشروع", description: "إنشاء مشروع جديد وتحديد اسمه ووصفه والجهات التابعة له." },
  products: { label: "إضافة منتج", description: "إضافة منتج إلى مشروع قائم مع تفاصيله التنفيذية." },
  activity: { label: "سجل العمليات", description: "متابعة الأحداث والبيانات المتأثرة واسم المستخدم وتوقيت الإجراء." },
  registration: { label: "طلب تسجيل", description: "تقديم طلب حساب جديد للمراجعة والاعتماد." },
  requests: { label: "طلبات التسجيل", description: "مراجعة الطلبات والموافقة عليها أو رفضها أو تعليقها." },
  mail: { label: "البريد الإلكتروني", description: "الرسائل المتعلقة بالتطبيق وإشعاراته وإعدادات ربط Google." },
  password: { label: "تغيير كلمة المرور", description: "تحديث كلمة المرور الخاصة بحسابك." },
  users: { label: "إدارة المستخدمين", description: "إدارة الحسابات والمناصب والتبعية الإدارية والجهات والمشاريع." },
  entities: { label: "إدارة الجهات", description: "إضافة الجهات وتعديلها وحجبها وحذف الجهات غير المرتبطة." },
} as const;
export type SettingsSection = keyof typeof SETTINGS_SECTIONS;
export function isSettingsSection(value: string): value is SettingsSection { return Object.hasOwn(SETTINGS_SECTIONS, value); }
export function canOpenSettings(section: SettingsSection, session: SessionInfo | null) {
  if (section === "account" || section === "registration") return true;
  if (!session?.authenticated) return false;
  if (section === "password") return true;
  if (session.mustChangePassword) return false;
  if (section === "projects" || section === "products") return permitted(session, section, "create");
  if (section === "activity") return true;
  return session.position === "system_admin" && session.canManageUsers;
}
