"use client";
import { useT } from "@/i18n/provider";
import { evalDict } from "@/i18n/dictionaries/eval";
import type { EvalDashboard } from "@/lib/eval-stats";

export function HeadlineCard({ headline }: { headline: NonNullable<EvalDashboard["headline"]> }) {
  const t = useT(evalDict);
  const d = headline.deltaVsPrev;
  const arrow = d == null ? "" : d > 0 ? "▲" : d < 0 ? "▼" : "=";
  const color = d == null ? "text-neutral-400" : d > 0 ? "text-green-600" : d < 0 ? "text-red-600" : "text-neutral-400";
  return (
    <div className="chart-card">
      <p className="text-sm text-neutral-500">{t("eval.overall")}</p>
      <div className="flex items-baseline gap-3">
        <span className="text-5xl font-bold tracking-tight">{headline.overallPct}%</span>
        {d != null && <span className={`text-sm font-medium ${color}`}>{arrow} {Math.abs(d)}% {t("eval.vsPrev")}</span>}
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        {headline.label ? `${headline.label} · ` : ""}{headline.model} · {headline.ranAt.toISOString().slice(0, 10)}
      </p>
    </div>
  );
}
