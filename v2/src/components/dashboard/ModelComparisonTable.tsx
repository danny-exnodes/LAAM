"use client";

// LAAM v2 — model-comparison table. Ports v1 public/dash-models.js (table part):
// one row per model with sessions / tokens / cost / avg duration / speed /
// completion %. Pure widget over the locked Stats["modelComparison"] slice.

import type { Stats } from "@/lib/stats.types";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { num, usd, shortModel } from "@/lib/format";
import { fmtDur } from "./_format";

export function ModelComparisonTable({
  modelComparison,
}: {
  modelComparison: Stats["modelComparison"];
}) {
  const t = useT(dashboard);
  const rows = modelComparison ?? [];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {t("dash.mdl.title")}
      </h3>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-neutral-500">{t("dash.mdl.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="border-b border-neutral-200 px-2.5 py-1.5 text-left dark:border-neutral-800">
                  {t("dash.mdl.th.model")}
                </th>
                <th className="border-b border-neutral-200 px-2.5 py-1.5 text-right dark:border-neutral-800">
                  {t("dash.mdl.th.sessions")}
                </th>
                <th className="border-b border-neutral-200 px-2.5 py-1.5 text-right dark:border-neutral-800">
                  {t("dash.mdl.th.tokens")}
                </th>
                <th className="border-b border-neutral-200 px-2.5 py-1.5 text-right dark:border-neutral-800">
                  {t("dash.mdl.th.cost")}
                </th>
                <th className="border-b border-neutral-200 px-2.5 py-1.5 text-right dark:border-neutral-800">
                  {t("dash.mdl.th.avgDur")}
                </th>
                <th className="border-b border-neutral-200 px-2.5 py-1.5 text-right dark:border-neutral-800">
                  {t("dash.mdl.th.speed")}
                </th>
                <th className="border-b border-neutral-200 px-2.5 py-1.5 text-right dark:border-neutral-800">
                  {t("dash.mdl.th.doneRate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.model}>
                  <td className="border-b border-neutral-100 px-2.5 py-1.5 text-left font-mono dark:border-neutral-800/60">
                    {shortModel(r.model)}
                  </td>
                  <td className="border-b border-neutral-100 px-2.5 py-1.5 text-right tabular-nums dark:border-neutral-800/60">
                    {num(r.sessions)}
                  </td>
                  <td className="border-b border-neutral-100 px-2.5 py-1.5 text-right tabular-nums dark:border-neutral-800/60">
                    {num(r.tokens)}
                  </td>
                  <td className="border-b border-neutral-100 px-2.5 py-1.5 text-right tabular-nums dark:border-neutral-800/60">
                    {usd(r.costUsd)}
                  </td>
                  <td className="border-b border-neutral-100 px-2.5 py-1.5 text-right tabular-nums dark:border-neutral-800/60">
                    {fmtDur(r.avgDurationMs)}
                  </td>
                  <td className="border-b border-neutral-100 px-2.5 py-1.5 text-right tabular-nums dark:border-neutral-800/60">
                    {num(r.tokensPerMin)}
                  </td>
                  <td className="border-b border-neutral-100 px-2.5 py-1.5 text-right tabular-nums dark:border-neutral-800/60">
                    {(r.doneRate * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
