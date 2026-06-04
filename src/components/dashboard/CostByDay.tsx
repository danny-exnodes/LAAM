"use client";

// LAAM v2 — estimated cost (USD) over time. Consumes the Wave-2 activity series
// (extended in v2 with a per-bucket `cost`); buckets are hourly for short spans
// and daily for longer ones (same labelling as ActivityTimeline).

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { Stats } from "@/lib/stats.types";
import { usd } from "@/lib/format";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { useChartTheme } from "@/hooks/useChartTheme";

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

export function mapCostByDay(
  activity: Stats["activity"],
): { label: string; cost: number }[] {
  if (activity.length === 0) return [];
  const daily = activity.length > 1 && activity[1].t - activity[0].t >= DAY_MS;
  return activity.map((p) => {
    const d = new Date(p.t);
    const label = daily
      ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
      : `${pad(d.getDate())} ${pad(d.getHours())}h`;
    return { label, cost: Math.round(p.cost * 100) / 100 };
  });
}

const COST_COLOR = "#f59e0b";

export function CostByDay({ activity }: { activity: Stats["activity"] }) {
  const t = useT(dashboard);
  const theme = useChartTheme();
  const data = mapCostByDay(activity);

  return (
    <div className="chart-card">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {t("dash.chart.costByDay")}
      </h3>
      {data.length === 0 ? (
        <p className="text-xs text-neutral-400">{t("dash.chart.empty")}</p>
      ) : (
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.axis }} />
              <YAxis
                tick={{ fontSize: 11, fill: theme.axis }}
                width={52}
                tickFormatter={(v) => usd(Number(v))}
              />
              <Tooltip formatter={(v) => usd(Number(v))} contentStyle={theme.tooltip} />
              <Area
                type="monotone"
                dataKey="cost"
                name={t("dash.ds.cost")}
                stroke={COST_COLOR}
                fill={COST_COLOR}
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
