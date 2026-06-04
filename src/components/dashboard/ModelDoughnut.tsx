"use client";

// LAAM v2 — Model breakdown doughnut. Labels via shortModel() (strips the
// claude- prefix and date suffix), matching v1.

import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { shortModel } from "@/lib/format";
import type { Stats } from "@/lib/stats.types";
import { Doughnut, type Slice } from "./Doughnut";

export function ModelDoughnut({ byModel }: { byModel: Stats["byModel"] }) {
  const t = useT(dashboard);
  const slices: Slice[] = Object.entries(byModel).map(([model, value]) => ({
    label: shortModel(model),
    value,
  }));
  return <Doughnut title={t("dash.chart.model")} slices={slices} />;
}
