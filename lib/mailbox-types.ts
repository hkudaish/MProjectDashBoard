export type InboxMessage = { id: string; subject: string; from: string; date: string | null; unread: boolean };
export type InboxDetail = InboxMessage & { text: string; replyTo: string };
