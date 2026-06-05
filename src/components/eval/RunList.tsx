"use client";
import { useT } from "@/i18n/provider";
import { evalDict } from "@/i18n/dictionaries/eval";
import type { EvalDashboard } from "@/lib/eval-stats";

export function RunList({ runs }: { runs: EvalDashboard["runs"] }) {
  const t = useT(evalDict);
  return (
    <div className="chart-card overflow-x-auto">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("eval.runs")}</h3>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-neutral-400">
            <th className="py-1 pr-2">{t("eval.col.date")}</th>
            <th className="px-2 py-1">{t("eval.col.label")}</th>
            <th className="px-2 py-1">{t("eval.col.model")}</th>
            <th className="px-2 py-1">{t("eval.col.overall")}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1 pr-2">{r.ranAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              <td className="px-2 py-1">{r.label ?? "—"}</td>
              <td className="px-2 py-1">{r.model}</td>
              <td className="px-2 py-1 font-medium">{r.overallPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
