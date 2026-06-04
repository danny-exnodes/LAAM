"use client";

// LAAM v2 — cost heatmap: 7 weekdays × 24 hours, cell intensity = cost/maxCost.
// Mirrors the activity Heatmap but keys off `Stats["costHeatmap"]` (summed
// costUsd by session-start weekday/hour, UTC) and formats values as USD.

import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { usd } from "@/lib/format";
import type { Stats } from "@/lib/stats.types";

const ACCENT = "#22c55e"; // green — "money" tone, distinct from the purple activity map
const DAY_KEYS = [
  "dash.hm.day.sun",
  "dash.hm.day.mon",
  "dash.hm.day.tue",
  "dash.hm.day.wed",
  "dash.hm.day.thu",
  "dash.hm.day.fri",
  "dash.hm.day.sat",
];
const HOUR_LABELLED = new Set([0, 3, 6, 9, 12, 15, 18, 21]);

export function CostHeatmap({ costHeatmap }: { costHeatmap: Stats["costHeatmap"] }) {
  const t = useT(dashboard);
  const cells = Array.isArray(costHeatmap) ? costHeatmap : [];
  const max = cells.reduce(
    (m, row) => row.reduce((rm, v) => (v > rm ? v : rm), m),
    0,
  );
  const dayLabels = DAY_KEYS.map((k) => t(k));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {t("dash.chart.costHeatmap")}
      </h3>

      {max <= 0 ? (
        <p className="px-1 py-6 text-sm text-neutral-400">{t("dash.hm.empty")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[480px] items-center gap-[2px]"
              style={{ gridTemplateColumns: "34px repeat(24, 1fr)" }}
            >
              <div className="h-4" />
              {Array.from({ length: 24 }, (_, hr) => (
                <div
                  key={`h${hr}`}
                  className="h-4 text-center text-[10px] leading-4 text-neutral-400"
                >
                  {HOUR_LABELLED.has(hr) ? hr : ""}
                </div>
              ))}

              {Array.from({ length: 7 }, (_, d) => {
                const row = cells[d] ?? [];
                return [
                  <div
                    key={`d${d}`}
                    className="h-[18px] pr-1.5 text-right text-[11px] leading-[18px] text-neutral-400"
                  >
                    {dayLabels[d]}
                  </div>,
                  ...Array.from({ length: 24 }, (_, hr) => {
                    const val = Number(row[hr]) || 0;
                    const op = val > 0 ? Math.max(0.08, val / max) : 0;
                    return (
                      <div
                        key={`c${d}-${hr}`}
                        data-testid="cost-hm-cell"
                        title={t("dash.hm.costCellTitle", {
                          day: dayLabels[d],
                          hr,
                          cost: usd(val),
                        })}
                        className="h-[18px] rounded-[3px] border border-neutral-200/60 transition-transform hover:scale-110 dark:border-neutral-700/60"
                        style={
                          val > 0
                            ? {
                                background: `color-mix(in srgb, ${ACCENT} ${(
                                  op * 100
                                ).toFixed(1)}%, transparent)`,
                              }
                            : undefined
                        }
                      />
                    );
                  }),
                ];
              })}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11px] text-neutral-400">
            <span>{t("dash.hm.low")}</span>
            <div
              className="h-3 w-[120px] rounded-[3px] border border-neutral-200/60 dark:border-neutral-700/60"
              style={{
                background: `linear-gradient(to right, transparent, ${ACCENT})`,
              }}
            />
            <span>{t("dash.hm.costHigh", { max: usd(max) })}</span>
          </div>
        </>
      )}
    </div>
  );
}
