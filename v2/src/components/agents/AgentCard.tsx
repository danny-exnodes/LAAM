"use client";

import { useEffect, useState } from "react";
import { Hexagon, GitBranch } from "lucide-react";
import { useT } from "@/i18n/provider";
import { agents } from "@/i18n/dictionaries/agents";
import { shortModel, usd, num } from "@/lib/format";
import { SubAgentList } from "./SubAgentList";
import type { LiveSession } from "@/hooks/useLiveSessions";

const STATUS_STYLES: Record<string, string> = {
  running: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  idle: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  done: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

// Left-accent bar colored by status — the v1 `.card.<status>::before` convention.
// Applied via inline style (not a Tailwind class) so the colour survives the
// card's `dark:border-neutral-800`, which would otherwise override the left
// border colour in dark mode. -500 tones read well on both light/dark cards.
const STATUS_ACCENT: Record<string, string> = {
  running: "#22c55e",
  idle: "#f59e0b",
  done: "#94a3b8",
};

// mm:ss / h:mm:ss elapsed from `startedAt`.
function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Live duration: re-renders once a second while the session is running.
function Elapsed({ startedAt, running }: { startedAt: number | null; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  if (startedAt == null) return null;
  return <span data-testid="elapsed">{fmtElapsed(now - startedAt)}</span>;
}

export function AgentCard({
  s,
  stuck,
  onSelect,
}: {
  s: LiveSession;
  stuck: boolean;
  onSelect: (s: LiveSession) => void;
}) {
  const t = useT(agents);
  const status = s.status ?? "done";
  const running = status === "running";
  const accent = stuck ? "#ef4444" : STATUS_ACCENT[status] ?? STATUS_ACCENT.done;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(s)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(s);
        }
      }}
      style={{ borderLeftColor: accent }}
      className="block cursor-pointer rounded-xl border border-l-4 border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={
              "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide " +
              (STATUS_STYLES[status] ?? STATUS_STYLES.done)
            }
          >
            {status}
          </span>
          {stuck && (
            <span
              title={t("agents.badgeStuckTitle")}
              className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-900/40 dark:text-red-300"
            >
              {t("agents.badgeStuck")}
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-[11px] text-neutral-500">{shortModel(s.model)}</div>
          {s.source === "local" && (
            <span title={t("agents.badgeLocalTitle")} className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-sky-500">
              <Hexagon size={11} aria-hidden /> {t("agents.badgeLocal")}
            </span>
          )}
        </div>
      </div>

      {s.latestActivity && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          {s.latestActivity}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        {running && <Elapsed startedAt={s.startedAt} running={running} />}
        <span>{num(s.messageCount)} {t("agents.msgUnit")}</span>
        <span>{num(s.toolCount)} {t("agents.toolUnit")}</span>
        <span title={t("agents.costTitle")} className="font-medium text-neutral-700 dark:text-neutral-300">
          {usd(s.costUsd)}
        </span>
        {s.gitBranch && (
          <span className="inline-flex items-center gap-0.5 font-mono">
            <GitBranch size={11} aria-hidden /> {s.gitBranch}
          </span>
        )}
      </div>

      {s.subAgents && s.subAgents.length > 0 && <SubAgentList items={s.subAgents} />}
    </div>
  );
}
