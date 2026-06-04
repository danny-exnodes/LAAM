"use client";

// LAAM v2 — dashboard export buttons. CSV exports the model-comparison table;
// PDF exports a plain-text summary of totals + top models + top tools. Ports
// the export entry points from v1 public/export.js, using the Wave 0
// downloadCsv / downloadPdf helpers.

import type { Stats } from "@/lib/stats.types";
import { useT } from "@/i18n/provider";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { downloadCsv, downloadPdf } from "@/lib/export";
import { num, usd, shortModel } from "@/lib/format";
import { fmtDur } from "./_format";

// Columns of the model-comparison CSV — keys match Stats["modelComparison"].
const CSV_COLUMNS = [
  "model",
  "sessions",
  "tokens",
  "costUsd",
  "avgDurationMs",
  "tokensPerMin",
  "doneRate",
];

// Build the PDF body: a text summary of totals, then top models and top tools.
export function buildPdfBody(stats: Stats, t: (k: string, v?: Record<string, string | number>) => string): string {
  const tot = stats.totals;
  const lines: string[] = [];
  lines.push(`${t("dash.pdf.createdAt", { time: new Date().toLocaleString() })}`);
  lines.push("");
  lines.push(t("dash.pdf.overview"));
  lines.push(`${t("dash.pdf.totalSessions")}: ${num(tot.sessions)}`);
  lines.push(`${t("dash.pdf.running")}: ${num(tot.running)}`);
  lines.push(`${t("dash.pdf.done")}: ${num(tot.done)}`);
  lines.push(`${t("dash.pdf.totalTokens")}: ${num(tot.tokensIn + tot.tokensOut)}`);
  lines.push(`${t("dash.pdf.estCost")}: ${usd(tot.costUsd)}`);
  lines.push(`${t("dash.pdf.totalToolCalls")}: ${num(tot.toolCalls)}`);
  lines.push("");

  lines.push(t("dash.pdf.byModel"));
  for (const m of stats.modelComparison) {
    lines.push(
      `${shortModel(m.model)} — ${num(m.sessions)} ss · ${num(m.tokens)} tok · ${usd(m.costUsd)} · ${fmtDur(m.avgDurationMs)} · ${(m.doneRate * 100).toFixed(0)}%`,
    );
  }
  lines.push("");

  lines.push(t("dash.pdf.topTools"));
  for (const tool of [...stats.toolLeaderboard].sort((a, b) => b.count - a.count).slice(0, 10)) {
    lines.push(`${tool.name} — ${num(tool.count)}`);
  }
  return lines.join("\n");
}

export function DashboardExport({ stats }: { stats: Stats }) {
  const t = useT(dashboard);

  function onCsv() {
    downloadCsv(
      "dashboard.csv",
      stats.modelComparison as unknown as Record<string, unknown>[],
      CSV_COLUMNS,
    );
  }

  function onPdf() {
    downloadPdf("dashboard.pdf", t("dash.pdf.title"), buildPdfBody(stats, t));
  }

  const btn =
    "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800";

  return (
    <div className="flex gap-2">
      <button type="button" className={btn} title={t("dash.exp.csvTitle")} onClick={onCsv}>
        {t("dash.exp.csv")}
      </button>
      <button type="button" className={btn} title={t("dash.exp.pdfTitle")} onClick={onPdf}>
        {t("dash.exp.pdf")}
      </button>
    </div>
  );
}
