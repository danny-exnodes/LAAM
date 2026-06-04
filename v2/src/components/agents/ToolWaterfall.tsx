"use client";

// LAAM v2 — Tool-call waterfall with an absolute time axis. Each bar is offset
// from the left by its start time and sized by its duration, both as a % of the
// session's total tool-call span — mirroring v1 public/session.js. A ruler row
// shows elapsed-time ticks across the span. Falls back to a left-aligned,
// max-relative layout when the calls carry no timestamps.

const MIN_PCT = 0.8; // keep zero/tiny bars visible

export type WaterfallCall = {
  name: string;
  start?: number | null;
  end?: number | null;
  durationMs: number | null;
  isError?: boolean;
};

export type WaterfallGeom = { t0: number; span: number; absolute: boolean };

const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

/** Span (start origin + total ms) across calls. Pure — unit-tested. */
export function waterfallSpan(calls: WaterfallCall[]): WaterfallGeom {
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const c of calls) {
    if (c.start == null) continue;
    t0 = Math.min(t0, c.start);
    const end = c.end ?? (c.durationMs ? c.start + c.durationMs : c.start);
    t1 = Math.max(t1, end);
  }
  if (!isFinite(t0)) {
    // No timestamps — fall back to a max-duration scale, all bars left-aligned.
    const maxMs = Math.max(0, ...calls.map((c) => c.durationMs ?? 0));
    return { t0: 0, span: Math.max(1, maxMs), absolute: false };
  }
  return { t0, span: Math.max(1, t1 - t0), absolute: true };
}

/** Bar [leftPct, widthPct] within the span. Pure — unit-tested. */
export function barGeom(c: WaterfallCall, geom: WaterfallGeom): [number, number] {
  const dur = c.durationMs && c.durationMs > 0 ? c.durationMs : 0;
  const left = geom.absolute && c.start != null
    ? ((c.start - geom.t0) / geom.span) * 100
    : 0;
  const clampedLeft = Math.max(0, Math.min(100, left));
  const width = Math.max(MIN_PCT, (dur / geom.span) * 100);
  return [clampedLeft, Math.min(width, 100 - clampedLeft)];
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
  const geom = waterfallSpan(calls);
  return (
    <div>
      {/* time-axis ruler */}
      <div className="grid grid-cols-[minmax(8rem,14rem)_1fr] items-center gap-3 px-3 pb-1.5 text-[10px] text-neutral-400">
        <span className="text-right">
          {geom.absolute ? "thời gian →" : "thời lượng →"}
        </span>
        <div className="relative h-3">
          {TICKS.map((p) => (
            <span
              key={p}
              className="absolute top-0 tabular-nums"
              style={{
                left: `${p * 100}%`,
                transform:
                  p === 0
                    ? "translateX(0)"
                    : p === 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              {fmtDur(Math.round(geom.span * p))}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {calls.map((c, i) => {
          const isError = c.isError === true;
          const [left, width] = barGeom(c, geom);
          const wide = width >= 9;
          return (
            <div
              key={i}
              className="grid grid-cols-[minmax(8rem,14rem)_1fr] items-center gap-3 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs dark:border-neutral-800"
            >
              <span className="truncate font-mono font-semibold text-[var(--color-accent)]">
                {c.name}
              </span>
              <div className="relative h-4 rounded bg-neutral-100 dark:bg-neutral-800">
                {/* tick guides aligned with the ruler */}
                {TICKS.map((p) => (
                  <span
                    key={p}
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-neutral-200/70 dark:bg-neutral-700/40"
                    style={{ left: `${p * 100}%` }}
                  />
                ))}
                <div
                  data-wf-bar
                  data-error={isError}
                  className={
                    "absolute inset-y-0 flex items-center justify-end rounded pr-1 " +
                    (isError ? "bg-red-500" : "bg-[var(--color-accent)]")
                  }
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${c.name} · ${fmtDur(c.durationMs)}${isError ? " · error" : ""}`}
                >
                  {wide && (
                    <span className="text-[10px] font-semibold tabular-nums text-white">
                      {fmtDur(c.durationMs)}
                    </span>
                  )}
                </div>
                {!wide && (
                  <span
                    className="absolute top-1/2 -translate-y-1/2 pl-1 text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400"
                    style={{ left: `${Math.min(left + width, 88)}%` }}
                  >
                    {fmtDur(c.durationMs)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
