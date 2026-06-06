// Mobile bottom tab bar (md:hidden). Five destinations with Chat raised + ~30%
// larger as the center focal point — the app-like pattern from the reference.
// Desktop keeps the top nav instead. Fixed; pages add bottom padding to clear it.

import Link from "next/link";
import { LayoutDashboard, Bot, MessageSquare, Plug, Settings, GitBranch } from "lucide-react";

const ITEMS: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  center?: boolean;
}[] = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/agents", label: "Agents", Icon: Bot },
  { href: "/workflows", label: "Workflows", Icon: GitBranch },
  { href: "/chat", label: "Chat", Icon: MessageSquare, center: true },
  { href: "/connectors", label: "Connectors", Icon: Plug },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function BottomNav({ current }: { current: string }) {
  return (
    <nav
      aria-label="Điều hướng"
      className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-neutral-200 bg-white/95 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden dark:border-neutral-800 dark:bg-neutral-900/95"
    >
      {ITEMS.map(({ href, label, Icon, center }) => {
        const active = current === href || current.startsWith(href + "/");
        if (center) {
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className="-mt-6 flex w-1/5 flex-col items-center gap-0.5"
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
            className="flex w-1/5 flex-col items-center gap-0.5 py-1"
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
