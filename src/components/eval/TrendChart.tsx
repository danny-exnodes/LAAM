"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import { useT } from "@/i18n/provider";
import { evalDict } from "@/i18n/dictionaries/eval";
import { useChartTheme, type ChartTheme } from "@/hooks/useChartTheme";
import type { TrendPoint } from "@/lib/eval-stats";

// Hue per dimension. The two cyans resolve through the theme series palette so
// light mode keeps ≥3:1 on the white card (WCAG 1.4.11 — hardcoded
// #36a6d6/#0ea5e9 were 2.77:1); dark keeps the bright hues. Other dims are
// fixed data encodings.
export function dimColors(series: ChartTheme["series"]): Record<string, string> {
  return {
    "tool-selection": series.accent, args: series.sky, grounding: "#22c55e",
    restraint: "#f59e0b", termination: "#14b8a6", "write-intent": "#ef4444", "rich-block": "#a855f7",
  };
}

// Which line series to draw: "overall" + every dimension that has ≥1 non-null point.
export function trendLines(trend: TrendPoint[]): string[] {
  const dims = new Set<string>();
  for (const p of trend) for (const [d, v] of Object.entries(p.perDim)) if (v !== null) dims.add(d);
  return ["overall", ...dims];
}

// Stroke per series: "overall" must follow the chart theme — a hardcoded
// near-black was invisible on the dark card bg. Dimensions take their hues
// from `dims` (built per-theme by dimColors above).
export function lineStroke(key: string, themeText: string, dims: Record<string, string>): string {
  return key === "overall" ? themeText : (dims[key] ?? "#888");
}

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const t = useT(evalDict);
  const theme = useChartTheme();
  const dims = dimColors(theme.series);
  // recharts needs flat rows: { run, overall, <dim>:pct, ... }
  const data = trend.map((p) => ({ run: p.run, overall: p.overall, ...p.perDim }));
  const lines = trendLines(trend);

  return (
    <div className="chart-card">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("eval.trend")}</h3>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="run" tick={{ fontSize: 11, fill: theme.axis }} />
            {/* width 44 + no negative margin: "100%" must not clip to "00%" */}
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: theme.axis }} width={44} tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v) => (v == null ? "—" : `${v}%`)} contentStyle={theme.tooltip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {lines.map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key === "overall" ? t("eval.overall") : t(`eval.dim.${key}`)}
                stroke={lineStroke(key, theme.text, dims)}
                strokeWidth={key === "overall" ? 3 : 1.5}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
