"use client";

// Right-side drawer showing one session's message/tool log, opened from an
// Agents card. Mirrors v1's agents drawer: the log lives here (quick peek
// without leaving the list); the tool-call waterfall lives on /agents/[id].

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, GitBranch } from "lucide-react";
import { shortModel, usd, num } from "@/lib/format";
import type { LiveSession } from "@/hooks/useLiveSessions";

type TimelineItem = {
  ts: number | null;
  role: string;
  kind?: string;
  text?: string;
  isError?: boolean;
};

const ROLE_STYLES: Record<string, string> = {
  assistant: "text-[var(--color-accent)]",
  user: "text-green-600 dark:text-green-400",
  tool: "text-amber-600 dark:text-amber-400",
};

// HH:MM:SS for a per-entry timestamp (#5). Null ts → em dash.
function fmtTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("vi-VN", { hour12: false });
}

export function AgentDrawer({
  session,
  onClose,
}: {
  session: LiveSession | null;
  onClose: () => void;
}) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setLoading(true);
    setTimeline([]);
    fetch(`/api/agents/${encodeURIComponent(session.id)}/timeline`)
      .then((r) => r.json())
      .then((d: { timeline?: TimelineItem[] }) => {
        if (alive) setTimeline(Array.isArray(d.timeline) ? d.timeline : []);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [session]);

  // Esc closes the drawer.
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, onClose]);

  if (!session) return null;
  const status = session.status ?? "done";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {status}
              </span>
              <span className="font-mono text-xs text-neutral-500">
                {shortModel(session.model)}
              </span>
            </div>
            <div className="mt-1 truncate text-sm font-semibold">
              {session.projectName ?? "—"}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-neutral-500">
              <span>{num(session.messageCount)} tin</span>
              <span>{num(session.toolCount)} tool</span>
              <span>{usd(session.costUsd)}</span>
              {session.gitBranch && (
                <span className="inline-flex items-center gap-0.5 font-mono">
                  <GitBranch size={11} aria-hidden /> {session.gitBranch}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/agents/${session.id}`}
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              Chi tiết →
            </Link>
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-lg border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
            Log
          </h3>
          {loading ? (
            <p className="text-sm text-neutral-500">Đang tải log…</p>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Không đọc được log (file có thể đã xoay vòng, hoặc nguồn ở máy
              khác — sẽ có khi collector đẩy events).
            </p>
          ) : (
            <ol className="space-y-2.5">
              {timeline.map((it, i) => (
                <li
                  key={i}
                  className="border-b border-neutral-100 pb-2.5 last:border-0 dark:border-neutral-800/60"
                >
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="font-mono text-[11px] tabular-nums text-neutral-400">
                      {fmtTime(it.ts)}
                    </span>
                    <span
                      className={
                        "text-[11px] font-bold uppercase tracking-wide " +
                        (ROLE_STYLES[it.role] ?? "text-neutral-400")
                      }
                    >
                      {it.role}
                    </span>
                  </div>
                  <p
                    className={
                      "whitespace-pre-wrap break-words text-sm " +
                      (it.isError
                        ? "text-red-600 dark:text-red-400"
                        : "text-neutral-700 dark:text-neutral-300")
                    }
                  >
                    {(it.text ?? "").slice(0, 2000)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
