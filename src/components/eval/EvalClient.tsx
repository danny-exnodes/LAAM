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
    return <div className="px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8"><p className="text-sm text-neutral-500">{t("eval.empty")}</p></div>;
  }
  return (
    <div className="space-y-4 px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
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
