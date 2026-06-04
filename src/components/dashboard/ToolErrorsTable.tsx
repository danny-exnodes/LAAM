"use client";

// LAAM v2 — most error-prone tools. Ports the error table from v1
// public/dash-tools.js: only tools that have errored, sorted by error rate
// (descending), showing calls / errors / rate.

import type { Stats } from "@/lib/stats.types";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { num } from "@/lib/format";

export function ToolErrorsTable({ tools }: { tools: Stats["toolLeaderboard"] }) {
  const t = useT(dashboard);
  const rows = [...(tools ?? [])]
    .filter((r) => r.errors > 0)
    .sort((a, b) => b.errorRate - a.errorRate);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {t("dash.tools.mostErrors")}
      </h3>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-neutral-500">{t("dash.tools.noErrors")}</p>
      ) : (
        <div className="max-h-56 overflow-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-neutral-500">
                <th className="border-b border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                  {t("dash.tools.th.tool")}
                </th>
                <th className="border-b border-neutral-200 px-2 py-1 text-right dark:border-neutral-800">
                  {t("dash.tools.th.calls")}
                </th>
                <th className="border-b border-neutral-200 px-2 py-1 text-right dark:border-neutral-800">
                  {t("dash.tools.th.errors")}
                </th>
                <th className="border-b border-neutral-200 px-2 py-1 text-right dark:border-neutral-800">
                  {t("dash.tools.th.rate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td
                    className="max-w-[12rem] truncate border-b border-neutral-100 px-2 py-1 text-left font-mono dark:border-neutral-800/60"
                    title={r.name}
                  >
                    {r.name}
                  </td>
                  <td className="border-b border-neutral-100 px-2 py-1 text-right tabular-nums dark:border-neutral-800/60">
                    {num(r.count)}
                  </td>
                  <td className="border-b border-neutral-100 px-2 py-1 text-right tabular-nums dark:border-neutral-800/60">
                    {num(r.errors)}
                  </td>
                  <td className="border-b border-neutral-100 px-2 py-1 text-right tabular-nums text-red-500 dark:border-neutral-800/60">
                    {(r.errorRate * 100).toFixed(1)}%
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
