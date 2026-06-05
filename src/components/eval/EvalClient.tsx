"use client";
import { useT } from "@/i18n/provider";
import { evalDict } from "@/i18n/dictionaries/eval";
import type { EvalDashboard } from "@/lib/eval-stats";
import { HeadlineCard } from "./HeadlineCard";
import { TrendChart } from "./TrendChart";
import { LatestTable } from "./LatestTable";
import { RunList } from "./RunList";

export function EvalClient({ dashboard }: { dashboard: EvalDashboard }) {
  const t = useT(evalDict);
  if (!dashboard.headline) {
    return <div className="p-6"><p className="text-sm text-neutral-500">{t("eval.empty")}</p></div>;
  }
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold">{t("eval.title")}</h1>
        <p className="text-sm text-neutral-500">{t("eval.subtitle")}</p>
      </div>
      <HeadlineCard headline={dashboard.headline} />
      <TrendChart trend={dashboard.trend} />
      {dashboard.latest && <LatestTable latest={dashboard.latest} />}
      <RunList runs={dashboard.runs} />
    </div>
  );
}
