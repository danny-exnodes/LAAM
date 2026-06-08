"use client";

// Run waterfall — each step as a horizontal bar offset by its start time and sized
// by its duration, under a workflow() total. Shown inline when a run is expanded.
// The layout math (waterfallLayout) is PURE for unit testing; the component only renders.

import type { WorkflowRun, WorkflowRunStep } from "@/db/schema";
import type { useT } from "@/i18n/provider";

export type WaterfallBar = {
  nodeId: string;
  status: string;
  offsetPct: number; // 0–100 — left edge as % of the run's total span
  widthPct: number; //  >0   — width as % of the total span (min clamp so tiny steps show)
  durationMs: number;
};

type TimedStep = Pick<WorkflowRunStep, "nodeId" | "status" | "seq" | "startedAt" | "finishedAt">;

const toMs = (d: Date | string | null | undefined): number | null => (d == null ? null : new Date(d).getTime());

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

/**
 * Lay out run steps on a 0–100% timeline. t0 = run start (or earliest step start);
 * t1 = run end (or latest step finish). A still-running step (no finishedAt) extends
 * to t1. Steps with no start are skipped (not yet run). Sorted by seq.
 */
export function waterfallLayout(
  steps: TimedStep[],
  runStart: Date | string | null,
  runEnd: Date | string | null,
): { bars: WaterfallBar[]; totalMs: number } {
  const starts = steps.map((s) => toMs(s.startedAt)).filter((x): x is number => x != null);
  const ends = steps.map((s) => toMs(s.finishedAt)).filter((x): x is number => x != null);
  const t0 = toMs(runStart) ?? (starts.length ? Math.min(...starts) : 0);
  const t1 = toMs(runEnd) ?? (ends.length ? Math.max(...ends) : t0);
  const totalMs = Math.max(1, t1 - t0); // guard divide-by-zero
  const bars: WaterfallBar[] = [];
  for (const s of [...steps].sort((a, b) => a.seq - b.seq)) {
    const start = toMs(s.startedAt);
    if (start == null) continue; // not started → no bar
    const end = toMs(s.finishedAt) ?? t1; // running → extend to the run end
    bars.push({
      nodeId: s.nodeId,
      status: s.status,
      offsetPct: Math.max(0, Math.min(100, ((start - t0) / totalMs) * 100)),
      widthPct: Math.max(1.5, Math.min(100, ((end - start) / totalMs) * 100)),
      durationMs: Math.max(0, end - start),
    });
  }
  return { bars, totalMs };
}

const BAR_COLOR: Record<string, string> = {
  succeeded: "#16a34a",
  success: "#16a34a",
  failed: "#dc2626",
  error: "#dc2626",
  running: "#2563eb",
};

export function RunWaterfall({
  run,
  steps,
  t,
}: {
  run: Pick<WorkflowRun, "startedAt" | "finishedAt">;
  steps: TimedStep[];
  t: ReturnType<typeof useT>;
}) {
  const { bars, totalMs } = waterfallLayout(steps, run.startedAt, run.finishedAt);
  if (bars.length === 0) return null;
  return (
    <div
      className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50/60 p-2.5 dark:border-neutral-700 dark:bg-neutral-900/40"
      data-testid="run-waterfall"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-500">{t("wf.waterfall.title")}</span>
        <span className="font-mono text-[11px] text-neutral-400">workflow() · {fmtMs(totalMs)}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {bars.map((b) => {
          const color = BAR_COLOR[b.status] ?? "#64748b";
          return (
            <div key={b.nodeId} className="relative h-5" title={`${b.nodeId} · ${fmtMs(b.durationMs)}`}>
              {/* faint full-width track */}
              <div className="absolute inset-x-0 top-2 h-1 rounded bg-neutral-100 dark:bg-neutral-800/70" />
              {/* the step bar, positioned by start + duration */}
              <div
                className="absolute top-1.5 h-2 rounded-sm"
                style={{ left: `${b.offsetPct}%`, width: `${b.widthPct}%`, backgroundColor: color }}
              />
              {/* label at the bar's start — nowrap so short bars stay readable */}
              <span
                className="absolute top-0 whitespace-nowrap font-mono text-[10px] text-neutral-600 dark:text-neutral-300"
                style={{ left: `${Math.min(b.offsetPct, 70)}%` }}
              >
                {b.nodeId} · {fmtMs(b.durationMs)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
