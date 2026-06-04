"use client";

import {
  ComposedChart,
  Bar,
  Line,
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

/**
 * Map the activity series to chart rows with a formatted x label.
 * Mirrors v1 dashboard.js: if buckets are >= 1 day apart use a "MM/DD" daily
 * label, otherwise an hourly "DD HHh" label. A single point is treated as
 * hourly (v1 default for sub-day buckets).
 */
export function mapActivity(
  activity: Stats["activity"],
): { label: string; sessions: number; tokens: number }[] {
  if (activity.length === 0) return [];
  const daily =
    activity.length > 1 && activity[1].t - activity[0].t >= DAY_MS;
  return activity.map((p) => {
    const d = new Date(p.t);
    const label = daily
      ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
      : `${pad(d.getDate())} ${pad(d.getHours())}h`;
    return { label, sessions: p.sessions, tokens: p.tokens };
  });
}

const SESSIONS_COLOR = "#6d5efc";
const TOKENS_COLOR = "#22c55e";

export function ActivityTimeline({
  activity,
}: {
  activity: Stats["activity"];
}) {
  const t = useT(dashboard);
  const theme = useChartTheme();
  const data = mapActivity(activity);

  return (
    <div className="chart-card">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {t("dash.chart.activity")}
      </h3>
      {data.length === 0 ? (
        <p className="text-xs text-neutral-400">{t("dash.chart.empty")}</p>
      ) : (
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme.grid}
                vertical={false}
              />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.axis }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: theme.axis }}
                width={40}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: theme.axis }}
                width={48}
                tickFormatter={(v) => num(Number(v))}
              />
              <Tooltip contentStyle={theme.tooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="left"
                dataKey="sessions"
                name={t("dash.ds.session")}
                fill={SESSIONS_COLOR}
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="tokens"
                name={t("dash.ds.tokens")}
                stroke={TOKENS_COLOR}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
