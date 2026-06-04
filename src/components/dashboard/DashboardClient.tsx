"use client";

// Dashboard integration shell (Wave 2). Fetches the full Stats object from
// /api/stats once and composes every widget. Each widget is a pure presenter
// taking a slice of Stats; this component owns layout, loading/error, and i18n
// section headings. Mirrors the v1 dashboard composition.

import { useEffect, useState } from "react";
import type { Stats } from "@/lib/stats.types";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";

import { KpiGrid } from "./KpiGrid";
import { StatusDoughnut } from "./StatusDoughnut";
import { ModelDoughnut } from "./ModelDoughnut";
import { BranchDoughnut } from "./BranchDoughnut";
import { ActivityTimeline } from "./ActivityTimeline";
import { Heatmap } from "./Heatmap";
import { CostHeatmap } from "./CostHeatmap";
import { CostByModel } from "./CostByModel";
import { CostByProject } from "./CostByProject";
import { CostByDay } from "./CostByDay";
import { TokensByDay } from "./TokensByDay";
import { ModelComparisonTable } from "./ModelComparisonTable";
import { ToolLeaderboard } from "./ToolLeaderboard";
import { ToolErrorsTable } from "./ToolErrorsTable";
import { SlowestTools } from "./SlowestTools";
import { TopSessions } from "./TopSessions";
import { DashboardExport } from "./DashboardExport";

export function DashboardClient() {
  const t = useT(dashboard);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/stats")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: Stats) => {
        if (alive) setStats(d);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <p className="p-6 text-sm text-red-600">{t("dash.page.error")}</p>;
  }
  if (!stats) {
    return <p className="p-6 text-sm text-neutral-500">{t("dash.page.loading")}</p>;
  }

  return (
    <main className="w-full space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">{t("dash.page.title")}</h1>
        <DashboardExport stats={stats} />
      </div>

      <KpiGrid totals={stats.totals} />

      <div className="grid gap-4 md:grid-cols-3">
        <StatusDoughnut byStatus={stats.byStatus} />
        <ModelDoughnut byModel={stats.byModel} />
        <BranchDoughnut byBranch={stats.byBranch} />
      </div>

      <ActivityTimeline activity={stats.activity} />

      <div className="grid gap-4 md:grid-cols-2">
        <CostByDay activity={stats.activity} />
        <TokensByDay activity={stats.activity} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CostByModel modelComparison={stats.modelComparison} />
        <CostByProject byProject={stats.byProject} />
      </div>

      <ModelComparisonTable modelComparison={stats.modelComparison} />

      <div className="grid gap-4 md:grid-cols-2">
        <ToolLeaderboard tools={stats.toolLeaderboard} />
        <SlowestTools tools={stats.toolLeaderboard} />
      </div>

      <ToolErrorsTable tools={stats.toolLeaderboard} />

      <TopSessions byDuration={stats.topByDuration} byTokens={stats.topByTokens} />

      <Heatmap heatmap={stats.heatmap} />

      <CostHeatmap costHeatmap={stats.costHeatmap} />
    </main>
  );
}
