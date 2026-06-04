"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Network,
  Plug,
  Server,
  Menu,
  X,
} from "lucide-react";
import { SyncButton } from "@/components/sync-button";
import { SignOutButton } from "@/components/signout-button";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/chat", label: "Chat", Icon: MessageSquare },
  { href: "/agents", label: "Agents", Icon: Bot },
  { href: "/graph", label: "Graph", Icon: Network },
  { href: "/connectors", label: "Connectors", Icon: Plug },
  { href: "/machines", label: "Machines", Icon: Server },
];

function NavLink({
  href,
  label,
  Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition " +
        (active
          ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
          : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800")
      }
    >
      <Icon size={15} strokeWidth={2} aria-hidden />
      {label}
    </Link>
  );
}

function RoleBadge({ role }: { role?: string }) {
  return (
    <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
      {role ?? "member"}
    </span>
  );
}

export function AppHeader({
  current,
  role,
}: {
  current: string;
  role?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur-md sm:px-6 dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-5">
          <Link href="/dashboard" className="text-base font-bold tracking-tight">
            LAAM <span className="text-xs font-normal text-neutral-400">v2</span>
          </Link>
          {/* Desktop nav — collapses into the hamburger menu below md. */}
          <nav className="hidden gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.href} {...n} active={current === n.href} />
            ))}
          </nav>
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
          <RoleBadge role={role} />
          <SyncButton />
          <SignOutButton />
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 md:hidden dark:hover:bg-neutral-800"
        >
          {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        </button>
      </div>

      {/* Mobile dropdown — absolutely positioned so the header bar keeps its
          ~56px height (chat's --header-h math depends on it). */}
      {open && (
        <div className="absolute inset-x-0 top-full z-50 flex flex-col gap-1 border-b border-neutral-200 bg-white px-4 py-3 shadow-lg md:hidden dark:border-neutral-800 dark:bg-neutral-900">
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.href}
                {...n}
                active={current === n.href}
                onClick={() => setOpen(false)}
              />
            ))}
          </nav>
          <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <RoleBadge role={role} />
            <SyncButton />
            <SignOutButton />
          </div>
        </div>
      )}
    </header>
  );
}
