"use client";

// LAAM v2 — top sessions, two ranked lists (by duration, by token usage).
// Ports the two "top sessions" bar charts from v1 public/dashboard.js as
// compact bar lists over the locked Stats["topByDuration"|"topByTokens"] slices.

import type { Stats } from "@/lib/stats.types";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { num } from "@/lib/format";
import { fmtDur } from "./_format";

const MIN_PCT = 2;

function RankedList({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; label: string; value: number; display: string }[];
}) {
  const empty = useEmptyLabel();
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const pct = max > 0 ? Math.max(MIN_PCT, Math.round((r.value / max) * 100)) : MIN_PCT;
            return (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3 text-xs"
              >
                <span className="truncate text-neutral-700 dark:text-neutral-200" title={r.label}>
                  {r.label}
                </span>
                <div className="h-3 rounded bg-neutral-100 dark:bg-neutral-800">
                  <div
                    data-session-bar
                    className="h-3 rounded bg-[var(--color-accent)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="tabular-nums text-neutral-500">{r.display}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// The empty label is shared by both lists; read it once via the dictionary.
function useEmptyLabel() {
  const t = useT(dashboard);
  return t("dash.chart.empty");
}

export function TopSessions({
  byDuration,
  byTokens,
}: {
  byDuration: Stats["topByDuration"];
  byTokens: Stats["topByTokens"];
}) {
  const t = useT(dashboard);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RankedList
        title={t("dash.chart.topDur")}
        rows={(byDuration ?? []).map((s) => ({
          id: s.id,
          label: s.label,
          value: s.durationMs,
          display: fmtDur(s.durationMs),
        }))}
      />
      <RankedList
        title={t("dash.chart.topTok")}
        rows={(byTokens ?? []).map((s) => ({
          id: s.id,
          label: s.label,
          value: s.tokens,
          display: num(s.tokens),
        }))}
      />
    </div>
  );
}
