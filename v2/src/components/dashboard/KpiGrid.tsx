"use client";

// LAAM v2 — KPI cards for the dashboard. Pure widget: takes the locked
// `Stats["totals"]` slice and renders one labeled card per metric.
// Ported from v1 public/dashboard.js renderKpis().

import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { usd, num } from "@/lib/format";
import type { Stats } from "@/lib/stats.types";

type Tone = "accent" | "running" | "done";

// ms → "Hh Mm", "Mm Ss" or "Ss". Dashboard KPIs need human duration, not raw ms.
function fmtDur(ms: number): string {
  if (!ms || ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const TONE_BORDER: Record<Tone, string> = {
  accent: "border-l-violet-500",
  running: "border-l-green-500",
  done: "border-l-neutral-400",
};

export function KpiGrid({ totals }: { totals: Stats["totals"] }) {
  const t = useT(dashboard);
  const items: { label: string; value: string; tone: Tone }[] = [
    { label: t("dash.kpi.sessions"), value: num(totals.sessions), tone: "accent" },
    { label: t("dash.kpi.running"), value: num(totals.running), tone: "running" },
    { label: t("dash.st.idle"), value: num(totals.idle), tone: "done" },
    { label: t("dash.st.done"), value: num(totals.done), tone: "done" },
    { label: t("dash.kpi.messages"), value: num(totals.messages), tone: "accent" },
    { label: t("dash.kpi.toolCalls"), value: num(totals.toolCalls), tone: "accent" },
    { label: t("dash.kpi.subAgents"), value: num(totals.subAgents), tone: "done" },
    { label: t("dash.kpi.tokensIn"), value: num(totals.tokensIn), tone: "accent" },
    { label: t("dash.kpi.tokensOut"), value: num(totals.tokensOut), tone: "accent" },
    { label: t("dash.kpi.cost"), value: usd(totals.costUsd), tone: "running" },
    { label: t("dash.kpi.avgDur"), value: fmtDur(totals.avgDurationMs), tone: "done" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((i) => (
        <div
          key={i.label}
          className={
            "rounded-xl border border-l-4 border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 " +
            TONE_BORDER[i.tone]
          }
        >
          <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            {i.label}
          </div>
          <div className="mt-1 text-2xl font-bold text-neutral-800 dark:text-neutral-100">
            {i.value}
          </div>
        </div>
      ))}
    </div>
  );
}
