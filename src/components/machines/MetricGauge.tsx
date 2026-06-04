"use client";

import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import { gaugeColor } from "@/lib/metric-colors";

// Semicircular gauge (180°→0°). Brand color, ramping amber/red under load.
export function MetricGauge({
  valuePct,
  color,
  label,
}: {
  valuePct: number;
  color: string;
  label: string;
}) {
  const v = Math.max(0, Math.min(100, valuePct));
  const fill = gaugeColor(color, v);
  return (
    <div style={{ width: "100%", height: 96 }} aria-label={`${label} ${v}%`}>
      <ResponsiveContainer>
        <RadialBarChart
          innerRadius="78%"
          outerRadius="100%"
          startAngle={180}
          endAngle={0}
          data={[{ v }]}
          barSize={10}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: "rgba(120,120,135,0.18)" }}
            dataKey="v"
            cornerRadius={6}
            fill={fill}
            angleAxisId={0}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}
