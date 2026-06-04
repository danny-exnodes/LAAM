import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/i18n/provider";
import { LANG_COOKIE } from "@/i18n/cookie";
import type { Lang } from "@/i18n/types";

export const metadata: Metadata = {
  title: "LAAM v2 — Local AI Agent Monitoring",
  description: "Local-first, multi-user (internal). Next.js + Postgres + Auth.js.",
};

// `viewportFit: "cover"` opts the page into the display cutout / home-indicator
// area so `env(safe-area-inset-*)` resolves to real values on iPhone (used e.g.
// by the chat composer's bottom padding). Without it those insets are always 0.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lock pinch/double-tap zoom for an app-like feel on phones.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
