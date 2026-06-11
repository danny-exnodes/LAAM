"use client";

// LAAM v2 — shared doughnut chart for the status/model/branch breakdowns.
// recharts PieChart for the visual; an explicit legend list (rendered by us,
// not recharts) carries the labels so they survive jsdom's zero-size layout
// and stay i18n-driven. Ported from v1 public/dashboard.js doughnuts.

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { num } from "@/lib/format";
import { useChartTheme, type ChartTheme } from "@/hooks/useChartTheme";

// Series palette (matches v1 palette().series order). The two cyans resolve
// through the chart theme — light mode darkens them to hold ≥3:1 on the white
// card (WCAG 1.4.11); the other hues stay fixed data encodings (see
// decisions/matte-dark-redesign).
export function seriesPalette(series: ChartTheme["series"]): string[] {
  return [
    series.accent,
    "#16a34a",
    series.sky,
    "#f59e0b",
    "#ec4899",
    "#14b8a6",
    "#a855f7",
    "#ef4444",
    "#84cc16",
    "#64748b",
  ];
}

export type Slice = { label: string; value: number; color?: string };

export function Doughnut({
  title,
  slices,
}: {
  title: string;
  slices: Slice[];
}) {
  const t = useT(dashboard);
  const theme = useChartTheme();
  const palette = seriesPalette(theme.series);
  const data = slices.filter((s) => s.value > 0);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {title}
      </h3>

      {data.length === 0 ? (
        <p className="px-1 py-6 text-sm text-neutral-400">
          {t("dash.chart.empty")}
        </p>
      ) : (
        <>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="58%"
                  outerRadius="85%"
                  stroke="none"
                >
                  {data.map((s, i) => (
                    <Cell
                      key={s.label}
                      fill={s.color ?? palette[i % palette.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={theme.tooltip}
                  formatter={(value, name) => [num(Number(value)), String(name)]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
            {data.map((s, i) => (
              <li
                key={s.label}
                data-testid="doughnut-legend-item"
                className="flex items-center gap-1.5"
              >
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: s.color ?? palette[i % palette.length] }}
                />
                <span>{s.label}</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  {num(s.value)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
