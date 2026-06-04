"use client";

// LAAM v2 — Status breakdown doughnut (running / idle / done).
// Relabels the well-known status keys via dash.st.*; unknown statuses pass
// through verbatim so nothing is silently dropped (Rule 12).

import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import type { Stats } from "@/lib/stats.types";
import { Doughnut, type Slice } from "./Doughnut";

const STATUS_COLOR: Record<string, string> = {
  running: "#16a34a",
  idle: "#f59e0b",
  done: "#64748b",
};
const STATUS_KEY: Record<string, string> = {
  running: "dash.st.running",
  idle: "dash.st.idle",
  done: "dash.st.done",
};

export function StatusDoughnut({ byStatus }: { byStatus: Stats["byStatus"] }) {
  const t = useT(dashboard);
  const slices: Slice[] = Object.entries(byStatus).map(([status, value]) => ({
    label: STATUS_KEY[status] ? t(STATUS_KEY[status]) : status,
    value,
    color: STATUS_COLOR[status],
  }));
  return <Doughnut title={t("dash.chart.status")} slices={slices} />;
}
