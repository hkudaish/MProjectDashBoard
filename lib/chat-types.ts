export type ChatMessage = { id: string; sender: string; recipient: string; text: string; createdAt: string; editedAt: string | null; readAt: string | null; recalledAt: string | null; removedAt: string | null; deletedFor: string[] };
export type ChatContact = { email: string; name: string; position: string | null; unread: number };
