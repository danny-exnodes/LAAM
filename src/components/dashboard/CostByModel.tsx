"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { Stats } from "@/lib/stats.types";
import { shortModel, usd } from "@/lib/format";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { useChartTheme } from "@/hooks/useChartTheme";

/**
 * Estimated cost per model, sorted by cost descending and capped at topN.
 * Model names are shortened the same way as the rest of the dashboard.
 */
export function mapCostByModel(
  modelComparison: Stats["modelComparison"],
  topN = 12,
): { model: string; costUsd: number }[] {
  return modelComparison
    .map((m) => ({ model: shortModel(m.model), costUsd: m.costUsd }))
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, topN);
}

export function CostByModel({
  modelComparison,
}: {
  modelComparison: Stats["modelComparison"];
}) {
  const t = useT(dashboard);
  const theme = useChartTheme();
  const data = mapCostByModel(modelComparison);

  return (
    <div className="chart-card">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {t("dash.cost.byModel")}
      </h3>
      {data.length === 0 ? (
        <p className="text-xs text-neutral-400">{t("dash.chart.empty")}</p>
      ) : (
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme.grid}
                vertical={false}
              />
              <XAxis dataKey="model" tick={{ fontSize: 11, fill: theme.axis }} />
              <YAxis
                tick={{ fontSize: 11, fill: theme.axis }}
                width={48}
                tickFormatter={(v) => usd(Number(v))}
              />
              <Tooltip
                formatter={(value) => [usd(Number(value)), "USD"]}
                contentStyle={theme.tooltip}
              />
              <Bar dataKey="costUsd" fill={theme.series.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
