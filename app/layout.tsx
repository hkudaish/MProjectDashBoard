import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "متابعة منتجات التواصل الاستراتيجي",
  description: "لوحة متابعة إسناد وتنفيذ منتجات عقد وامي للتواصل الاستراتيجي.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
