"use client";

// LAAM v2 — tokens in vs out over time (stacked area). Consumes the v2-extended
// activity series (`tokensIn`/`tokensOut` per bucket). Same hourly/daily
// labelling as ActivityTimeline.

import {
  AreaChart,
  Area,
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

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

export function mapTokensByDay(
  activity: Stats["activity"],
): { label: string; tokensIn: number; tokensOut: number }[] {
  if (activity.length === 0) return [];
  const daily = activity.length > 1 && activity[1].t - activity[0].t >= DAY_MS;
  return activity.map((p) => {
    const d = new Date(p.t);
    const label = daily
      ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
      : `${pad(d.getDate())} ${pad(d.getHours())}h`;
    return { label, tokensIn: p.tokensIn, tokensOut: p.tokensOut };
  });
}

const OUT_COLOR = "#22c55e";

export function TokensByDay({ activity }: { activity: Stats["activity"] }) {
  const t = useT(dashboard);
  const theme = useChartTheme();
  const data = mapTokensByDay(activity);

  return (
    <div className="chart-card">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {t("dash.chart.tokensByDay")}
      </h3>
      {data.length === 0 ? (
        <p className="text-xs text-neutral-400">{t("dash.chart.empty")}</p>
      ) : (
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.axis }} />
              <YAxis
                tick={{ fontSize: 11, fill: theme.axis }}
                width={48}
                tickFormatter={(v) => num(Number(v))}
              />
              <Tooltip formatter={(v) => num(Number(v))} contentStyle={theme.tooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="tokensIn"
                stackId="tok"
                name={t("dash.ds.input")}
                stroke={theme.series.accent}
                fill={theme.series.accent}
                fillOpacity={0.25}
              />
              <Area
                type="monotone"
                dataKey="tokensOut"
                stackId="tok"
                name={t("dash.ds.output")}
                stroke={OUT_COLOR}
                fill={OUT_COLOR}
                fillOpacity={0.25}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
