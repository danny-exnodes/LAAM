import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/i18n/provider";
import { LANG_COOKIE } from "@/i18n/cookie";
import type { Lang } from "@/i18n/types";
import { NoZoom } from "@/components/no-zoom";
import { GlobalAurora } from "@/components/aurora/GlobalAurora";

// Runs before first paint: applies the saved theme (or the OS preference in
// "system" mode) by toggling `.dark` on <html>, so there is no light→dark flash.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('laam_theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

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
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <NoZoom />
        <I18nProvider lang={lang}>
          {/* App-wide Aurora background (dark mode, all routes except the landing,
              which has its own). Fixed at z-0; content sits in a z-1 layer above. */}
          <GlobalAurora />
          <div className="relative z-[1]">{children}</div>
        </I18nProvider>
      </body>
    </html>
  );
}
