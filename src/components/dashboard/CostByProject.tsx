"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { Stats } from "@/lib/stats.types";
import { num } from "@/lib/format";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { useChartTheme } from "@/hooks/useChartTheme";

/**
 * Token totals per project (in + out), sorted by total descending and capped
 * at topN. The locked Stats["byProject"] carries no cost field (unlike v1), so
 * this widget charts token usage per project — the closest parity available.
 */
export function mapTokensByProject(
  byProject: Stats["byProject"],
  topN = 12,
): { project: string; tokensIn: number; tokensOut: number; total: number }[] {
  return byProject
    .map((p) => ({
      project: p.project,
      tokensIn: p.tokensIn,
      tokensOut: p.tokensOut,
      total: p.tokensIn + p.tokensOut,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);
}

const OUT_COLOR = "#22c55e";

export function CostByProject({
  byProject,
}: {
  byProject: Stats["byProject"];
}) {
  const t = useT(dashboard);
  const theme = useChartTheme();
  const data = mapTokensByProject(byProject);

  return (
    <div className="chart-card">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {t("dash.chart.tokens")}
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
              <XAxis dataKey="project" tick={{ fontSize: 11, fill: theme.axis }} />
              <YAxis
                tick={{ fontSize: 11, fill: theme.axis }}
                width={48}
                tickFormatter={(v) => num(Number(v))}
              />
              <Tooltip
                formatter={(value) => num(Number(value))}
                contentStyle={theme.tooltip}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="tokensIn"
                stackId="tok"
                name={t("dash.ds.input")}
                fill={theme.series.accent}
              />
              <Bar
                dataKey="tokensOut"
                stackId="tok"
                name={t("dash.ds.output")}
                fill={OUT_COLOR}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
