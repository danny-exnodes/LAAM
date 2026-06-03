import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LAAM v2 — Local AI Agent Monitoring",
  description: "Local-first, multi-user (internal). Next.js + Postgres + Auth.js.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
