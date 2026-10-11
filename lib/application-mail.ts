export const APPLICATION_MAIL_MARKER = "[MProjDashboard]";
export const APPLICATION_INBOX_QUERY = 'subject:"MProjDashboard"';
export function isApplicationMail(subject: string) { return /\bMProjDashboard\b/i.test(subject); }
export function applicationMailSubject(subject: string) {
  return isApplicationMail(subject) ? subject : `${APPLICATION_MAIL_MARKER} ${subject}`;
}
export function displayMailSubject(subject: string) {
  return subject.replace(/\[MProjDashboard\]\s*/gi, "").trim();
}
