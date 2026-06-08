"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export function CostChart({
  data,
}: {
  data: { day: string; cost: number }[];
}) {
  if (!data.length) {
    return <p className="text-xs text-neutral-400">Chưa có dữ liệu chi phí.</p>;
  }
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#36a6d6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#36a6d6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={44} />
          <Tooltip
            formatter={(value) => ["$" + Number(value).toFixed(2), "Chi phí"]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Area
            type="monotone"
            dataKey="cost"
            stroke="#36a6d6"
            strokeWidth={2}
            fill="url(#costGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
