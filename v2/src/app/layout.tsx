import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/i18n/provider";
import { LANG_COOKIE } from "@/i18n/cookie";
import type { Lang } from "@/i18n/types";

export const metadata: Metadata = {
  title: "LAAM v2 — Local AI Agent Monitoring",
  description: "Local-first, multi-user (internal). Next.js + Postgres + Auth.js.",
};

const SUPPORTED: readonly string[] = ["vi", "en", "zh"];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read the persisted language server-side so the first paint is localized.
  const raw = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = raw && SUPPORTED.includes(raw) ? (raw as Lang) : "vi";

  return (
    <html lang={lang}>
      <body className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
