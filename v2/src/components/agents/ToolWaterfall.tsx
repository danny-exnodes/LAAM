"use client";

// LAAM v2 — Tool-call waterfall: horizontal bars whose width is proportional
// to each call's duration relative to the longest call in the set. No absolute
// timeline (the input carries no start/end), so bars are left-aligned.

const MIN_PCT = 2; // keep zero/tiny bars visible

export type WaterfallCall = {
  name: string;
  durationMs: number | null;
  isError?: boolean;
};

/** Bar width in % of the longest call. Pure — unit-tested. */
export function barWidthPct(durationMs: number | null, maxMs: number): number {
  const d = durationMs && durationMs > 0 ? durationMs : 0;
  if (!maxMs || maxMs <= 0) return d > 0 ? 100 : MIN_PCT;
  return Math.max(MIN_PCT, Math.round((d / maxMs) * 100));
}

function fmtDur(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${Math.round(ms / 100) / 10}s`;
}

export function ToolWaterfall({ calls }: { calls: WaterfallCall[] }) {
  if (!calls.length) {
    return (
      <p className="text-sm text-neutral-500">Phiên này chưa có tool call.</p>
    );
  }
  const maxMs = Math.max(0, ...calls.map((c) => c.durationMs ?? 0));
  return (
    <div className="space-y-1">
      {calls.map((c, i) => {
        const isError = c.isError === true;
        return (
          <div
            key={i}
            className="grid grid-cols-[minmax(8rem,14rem)_1fr] items-center gap-3 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs dark:border-neutral-800"
          >
            <span className="truncate font-mono font-semibold text-[var(--color-accent)]">
              {c.name}
            </span>
            <div className="relative h-4 rounded bg-neutral-100 dark:bg-neutral-800">
              <div
                data-wf-bar
                data-error={isError}
                className={
                  "absolute inset-y-0 left-0 flex items-center justify-end rounded pr-1 " +
                  (isError ? "bg-red-500" : "bg-[var(--color-accent)]")
                }
                style={{ width: `${barWidthPct(c.durationMs, maxMs)}%` }}
                title={`${c.name} · ${fmtDur(c.durationMs)}${isError ? " · error" : ""}`}
              >
                <span className="text-[10px] font-semibold tabular-nums text-white">
                  {fmtDur(c.durationMs)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
