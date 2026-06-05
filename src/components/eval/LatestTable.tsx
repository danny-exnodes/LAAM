"use client";
import { useT } from "@/i18n/provider";
import { evalDict } from "@/i18n/dictionaries/eval";
import type { EvalDashboard } from "@/lib/eval-stats";

const DIMS = ["tool-selection", "args", "grounding", "restraint", "termination", "write-intent", "rich-block"];

export function LatestTable({ latest }: { latest: NonNullable<EvalDashboard["latest"]> }) {
  const t = useT(evalDict);
  const cell = (c?: { passed: number; total: number }) =>
    !c ? "—" : `${c.passed}/${c.total}`;
  const tone = (c?: { passed: number; total: number }) =>
    !c ? "" : c.passed === 0 ? "text-red-600" : c.passed < c.total ? "text-amber-600" : "text-green-600";
  return (
    <div className="chart-card overflow-x-auto">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("eval.latest")}</h3>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-neutral-400">
            <th className="py-1 pr-2">{t("eval.scenario")}</th>
            {DIMS.map((d) => <th key={d} className="px-2 py-1">{t(`eval.dim.${d}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {latest.scores.map((s) => (
            <tr key={s.id} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1 pr-2 font-medium">{s.id}</td>
              {DIMS.map((d) => <td key={d} className={`px-2 py-1 ${tone(s.perDim[d])}`}>{cell(s.perDim[d])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-neutral-400">ℹ️ {t("eval.writeNote")}</p>
    </div>
  );
}
