export type InboxMessage = { id: string; subject: string; from: string; date: string | null; unread: boolean; preview?: string };
export type InboxDetail = InboxMessage & { text: string; replyTo: string };
