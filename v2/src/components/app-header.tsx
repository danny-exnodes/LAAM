import Link from "next/link";
import { SyncButton } from "@/components/sync-button";
import { SignOutButton } from "@/components/signout-button";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
  { href: "/agents", label: "Agents" },
  { href: "/graph", label: "Graph" },
  { href: "/machines", label: "Machines" },
];

export function AppHeader({
  current,
  role,
}: {
  current: string;
  role?: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
      <div className="flex items-center gap-5">
        <Link href="/dashboard" className="text-base font-bold tracking-tight">
          LAAM <span className="text-xs font-normal text-neutral-400">v2</span>
        </Link>
        <nav className="flex gap-1">
          {NAV.map((n) => {
            const active = current === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                  (active
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800")
                }
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {role ?? "member"}
        </span>
        <SyncButton />
        <SignOutButton />
      </div>
    </header>
  );
}
