"use client";

// Renders a v1-style ```chart fenced block (Chart.js-ish JSON) using recharts.
// Mirrors the schema in public/chat-render.js: { type, title?, data:{labels,datasets}, options? }.
// Chart.js groups values by dataset; recharts wants one row object per label, so
// chartToRecharts() transposes labels×datasets into rows + a series descriptor.

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

// Accent-led palette — same leading colors as v1 chartPalette().
const PALETTE = [
  "#6d5efc",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#a855f7",
  "#ec4899",
  "#84cc16",
  "#3b82f6",
  "#f97316",
];

type RechartsKind = "bar" | "line" | "pie";

export type ChartModel =
  | {
      kind: RechartsKind;
      title?: string;
      rows: Record<string, number | string>[];
      series: { key: string; label: string; color: string }[];
      sliceColors?: string[];
    }
  | { error: string };

const PIE_TYPES = new Set(["pie", "doughnut", "polararea"]);
const LINE_TYPES = new Set(["line", "radar"]);

// Pure: parse v1 chart JSON → recharts-ready model (or an error).
export function chartToRecharts(raw: string): ChartModel {
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return { error: "invalid" };
  }
  if (!cfg || typeof cfg !== "object") return { error: "invalid" };
  const c = cfg as {
    type?: string;
    title?: string;
    data?: { labels?: unknown[]; datasets?: { label?: string; data?: number[] }[] };
  };
  const data = c.data;
  if (!data || typeof data !== "object") return { error: "invalid" };
  const datasets = Array.isArray(data.datasets) ? data.datasets : [];
  const labels = Array.isArray(data.labels) ? data.labels.map((l) => String(l)) : [];
  if (!datasets.length && !labels.length) return { error: "invalid" };

  const type = (c.type || "bar").toLowerCase();
  const title = typeof c.title === "string" ? c.title : undefined;

  // Pie/doughnut → a single series of {name, value} with per-slice colors.
  if (PIE_TYPES.has(type)) {
    const ds = datasets[0]?.data ?? [];
    const names = labels.length ? labels : ds.map((_, i) => String(i + 1));
    const rows = names.map((name, i) => ({ name, value: Number(ds[i] ?? 0) }));
    const sliceColors = rows.map((_, i) => PALETTE[i % PALETTE.length]);
    return { kind: "pie", title, rows, series: [{ key: "value", label: "value", color: PALETTE[0] }], sliceColors };
  }

  const kind: RechartsKind = LINE_TYPES.has(type) ? "line" : "bar";
  const series = datasets.map((ds, i) => ({
    key: "s" + i,
    label: ds.label ?? "s" + i,
    color: PALETTE[i % PALETTE.length],
  }));
  const rowCount = labels.length || Math.max(0, ...datasets.map((d) => (d.data ? d.data.length : 0)));
  const rows: Record<string, number | string>[] = [];
  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, number | string> = { name: labels[i] ?? String(i + 1) };
    datasets.forEach((ds, di) => {
      row[series[di].key] = Number(ds.data?.[i] ?? 0);
    });
    rows.push(row);
  }
  return { kind, title, rows, series };
}

const AXIS_TICK = { fontSize: 11 } as const;

export function ChartBlock({ raw }: { raw: string }) {
  const model = chartToRecharts(raw);
  if ("error" in model) {
    return <div className="chat-block-error">Biểu đồ không hợp lệ.</div>;
  }
  const { kind, title, rows, series, sliceColors } = model;

  return (
    <div className="chat-chart">
      {title ? <h4>{title}</h4> : null}
      <div style={{ position: "relative", width: "100%", height: 260 }}>
        <ResponsiveContainer>
          {kind === "pie" ? (
            <PieChart>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Pie data={rows} dataKey="value" nameKey="name" outerRadius="80%">
                {rows.map((_, i) => (
                  <Cell key={i} fill={(sliceColors ?? PALETTE)[i % (sliceColors ?? PALETTE).length]} />
                ))}
              </Pie>
            </PieChart>
          ) : kind === "line" ? (
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} width={44} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} width={44} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
