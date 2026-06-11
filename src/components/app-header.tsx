import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Network,
  Plug,
  Settings,
  Gauge,
  GitBranch,
  Activity,
  Search,
} from "lucide-react";
import { auth } from "@/auth";
import { gravatarUrl } from "@/lib/gravatar";
import { SyncButton } from "@/components/sync-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangSelect } from "@/components/lang-select";
import { UserAvatar } from "@/components/user-avatar";
import { BottomNav } from "@/components/bottom-nav";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/chat", label: "Chat", Icon: MessageSquare },
  { href: "/monitoring", label: "Monitoring", Icon: Activity },
  { href: "/agents", label: "Agents", Icon: Bot },
  { href: "/workflows", label: "Workflows", Icon: GitBranch },
  { href: "/eval", label: "Reliability", Icon: Gauge },
  { href: "/graph", label: "Graph", Icon: Network },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/connectors", label: "Connectors", Icon: Plug },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function NavLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link
      href={href}
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

// Server component: reads the session itself (avatar + role), so pages just pass
// `current`. Top bar = brand + desktop nav + always-visible icon actions
// (language / theme / sync / avatar). Mobile navigation lives in <BottomNav>.
export async function AppHeader({ current }: { current: string; role?: string }) {
  const user = (await auth())?.user;
  const avatarUrl = gravatarUrl(user?.email);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="text-base font-bold tracking-tight">
              LAAM <span className="text-xs font-normal text-neutral-400">v2</span>
            </Link>
            <nav className="hidden gap-1 md:flex">
              {NAV.map((n) => (
                <NavLink key={n.href} {...n} active={current === n.href || current.startsWith(n.href + "/")} />
              ))}
            </nav>
          </div>

          {/* Always-visible icon actions (mobile + desktop). */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <LangSelect />
            <ThemeToggle />
            <SyncButton />
            <UserAvatar avatarUrl={avatarUrl} role={user?.role} name={user?.name} />
          </div>
        </div>
      </header>

      <BottomNav current={current} />
    </>
  );
}
