"use client";

// LAAM v2 — most-used tools leaderboard. Ports the "most used" horizontal-bar
// chart from v1 public/dash-tools.js as a CSS-bar list: top-12 tools by call
// count, each bar's width proportional to the busiest tool.

import type { Stats } from "@/lib/stats.types";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { num } from "@/lib/format";

const TOP_N = 12;
const MIN_PCT = 2; // keep tiny bars visible

export function ToolLeaderboard({ tools }: { tools: Stats["toolLeaderboard"] }) {
  const t = useT(dashboard);
  const rows = [...(tools ?? [])]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
  const max = Math.max(0, ...rows.map((r) => r.count));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {t("dash.tools.mostUsed")}
      </h3>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-neutral-500">{t("dash.chart.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const pct = max > 0 ? Math.max(MIN_PCT, Math.round((r.count / max) * 100)) : MIN_PCT;
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
                    data-tool-bar
                    className="h-3 rounded bg-[var(--color-accent)]"
                    style={{ width: `${pct}%` }}
                    title={t("dash.tools.tooltipCalls", { n: num(r.count) })}
                  />
                </div>
                <span className="tabular-nums text-neutral-500">{num(r.count)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
