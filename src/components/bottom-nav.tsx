"use client";

// Mobile bottom tab bar (md:hidden). Seven destinations with Chat raised + ~30%
// larger as the center focal point — the app-like pattern from the reference.
// Items use flex-1 (not a fixed w-1/5) so the row stays at 100% as destinations grow.
// Desktop keeps the top nav instead. Fixed; pages add bottom padding to clear it.
// Client component: the aria-label resolves through the i18n provider.

import Link from "next/link";
import { LayoutDashboard, Activity, MessageSquare, Plug, Settings, GitBranch, Search } from "lucide-react";
import { useT } from "@/i18n/provider";
import { common } from "@/i18n/dictionaries/common";

const ITEMS: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  center?: boolean;
}[] = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/monitoring", label: "Monitoring", Icon: Activity },
  { href: "/workflows", label: "Workflows", Icon: GitBranch },
  { href: "/chat", label: "Chat", Icon: MessageSquare, center: true },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/connectors", label: "Connectors", Icon: Plug },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function BottomNav({ current }: { current: string }) {
  const t = useT(common);
  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-neutral-200 bg-white px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] md:hidden dark:border-neutral-800 dark:bg-neutral-900"
    >
      {ITEMS.map(({ href, label, Icon, center }) => {
        const active = current === href || current.startsWith(href + "/");
        if (center) {
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className="-mt-6 flex flex-1 min-w-0 flex-col items-center gap-0.5"
            >
              <span
                className={
                  "grid h-14 w-14 place-items-center rounded-full shadow-lg ring-4 ring-white transition dark:ring-neutral-900 " +
                  (active ? "bg-[var(--color-accent)]" : "bg-neutral-900 dark:bg-neutral-100")
                }
              >
                <MessageSquare
                  size={24}
                  className={active ? "text-white" : "text-white dark:text-neutral-900"}
                  aria-hidden
                />
              </span>
              <span
                className={
                  "text-[10px] " +
                  (active ? "font-medium text-[var(--color-accent)]" : "text-neutral-500")
                }
              >
                {label}
              </span>
            </Link>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-1 min-w-0 flex-col items-center gap-0.5 py-1"
          >
            <Icon
              size={20}
              className={active ? "text-[var(--color-accent)]" : "text-neutral-500"}
              aria-hidden
            />
            <span
              className={
                "text-[10px] " +
                (active ? "font-medium text-[var(--color-accent)]" : "text-neutral-500")
              }
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
