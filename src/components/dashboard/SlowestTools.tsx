"use client";

// LAAM v2 — slowest tools by average call duration. Ports the "slowest" bar
// chart from v1 public/dash-tools.js as a CSS-bar list: tools with a known
// avgDurationMs, sorted descending (nulls dropped/last), bar width relative to
// the slowest.

import type { Stats } from "@/lib/stats.types";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { fmtDur } from "./_format";

const MIN_PCT = 2;

export function SlowestTools({ tools }: { tools: Stats["toolLeaderboard"] }) {
  const t = useT(dashboard);
  // Sort by avgDurationMs descending with nulls last, then keep only timed tools.
  const rows = [...(tools ?? [])]
    .sort((a, b) => (b.avgDurationMs ?? -1) - (a.avgDurationMs ?? -1))
    .filter((r) => r.avgDurationMs != null);
  const max = Math.max(0, ...rows.map((r) => r.avgDurationMs ?? 0));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {t("dash.tools.slowest")}
      </h3>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-neutral-500">{t("dash.chart.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const ms = r.avgDurationMs ?? 0;
            const pct = max > 0 ? Math.max(MIN_PCT, Math.round((ms / max) * 100)) : MIN_PCT;
            return (
              <li
                key={r.name}
                className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-xs"
              >
                <span className="truncate font-mono text-neutral-700 dark:text-neutral-200" title={r.name}>
                  {r.name}
                </span>
                <div className="h-3 rounded bg-neutral-100 dark:bg-neutral-800">
                  <div
                    data-slow-bar
                    className="h-3 rounded bg-[var(--color-idle,#f59e0b)]"
                    style={{ width: `${pct}%` }}
                    title={fmtDur(ms)}
                  />
                </div>
                <span className="tabular-nums text-neutral-500">{fmtDur(ms)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
