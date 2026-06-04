"use client";

// LAAM v2 — Branch breakdown doughnut (sessions per git branch).

import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import type { Stats } from "@/lib/stats.types";
import { Doughnut, type Slice } from "./Doughnut";

export function BranchDoughnut({ byBranch }: { byBranch: Stats["byBranch"] }) {
  const t = useT(dashboard);
  const slices: Slice[] = Object.entries(byBranch).map(([branch, value]) => ({
    label: branch,
    value,
  }));
  return <Doughnut title={t("dash.chart.branch")} slices={slices} />;
}
