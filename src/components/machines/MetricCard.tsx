"use client";

import type { ReactNode } from "react";
import { MetricGauge } from "./MetricGauge";

// One hardware metric: icon + label, a semicircular gauge, and the current value
// overlaid at the gauge's flat base. Follows the app card idiom with a colored
// top border (inline so dark: utilities don't override it).
export function MetricCard({
  label,
  color,
  valuePct,
  primary,
  sub,
  icon,
}: {
  label: string;
  color: string;
  valuePct: number;
  primary: string;
  sub: string;
  icon: ReactNode;
}) {
  return (
    <div
      style={{ borderTopColor: color }}
      className="rounded-xl border border-t-2 border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
        <span style={{ color }}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="relative mt-2">
        <MetricGauge valuePct={valuePct} color={color} label={label} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-2xl font-bold text-neutral-800 dark:text-neutral-100">
            {primary}
          </span>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{sub}</span>
        </div>
      </div>
    </div>
  );
}
