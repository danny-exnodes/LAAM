"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useChartTheme } from "@/hooks/useChartTheme";

export interface Series {
  key: string;
  name: string;
  color: string;
}

// Realtime multi-series area over the rolling window (0..100%). Per-series
// gradient fill, following the dashboard chart conventions (.chart-card +
// useChartTheme).
export function MetricSparkline({
  data,
  series,
  title,
}: {
  data: Record<string, number | string>[];
  series: Series[];
  title: string;
}) {
  const theme = useChartTheme();
  return (
    <div className="chart-card">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{title}</h3>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="t" tick={false} axisLine={false} height={1} />
            <YAxis domain={[0, 100]} width={32} tick={{ fontSize: 11, fill: theme.axis }} />
            <Tooltip contentStyle={theme.tooltip} formatter={(v) => `${v}%`} labelFormatter={() => ""} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                fill={`url(#grad-${s.key})`}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
