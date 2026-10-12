export type RegistrationStatus = "pending" | "approved" | "rejected" | "on_hold" | "activated";
export const REGISTRATION_LABELS: Record<RegistrationStatus, string> = {
  pending: "بانتظار المراجعة", approved: "موافق عليه — استكمال الاعتماد", rejected: "مرفوض", on_hold: "معلّق", activated: "تم تفعيل الحساب",
};
export type RegistrationRequest = {
  id: string; name: string; jobTitle: string; department: string; email: string; entityId?: string; entityName?: string;
  status: RegistrationStatus; createdAt: string; updatedAt: string;
  projectId?: string; projectName?: string;
  note: string; reviewedBy: string | null;
  notifications: { id: string; to: string; subject: string; text: string; status: "queued" | "sent" | "failed"; sentAt: string | null }[];
};
