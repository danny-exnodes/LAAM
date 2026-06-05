import { writeFile, mkdir } from "node:fs/promises";
import type { DimKey, ScenarioScore } from "./types";

const DIMS: DimKey[] = ["tool-selection", "args", "grounding", "restraint", "termination", "write-intent", "rich-block"];
const HEAD = ["sel", "args", "ground", "restraint", "term", "write", "block"];

function cell(s: ScenarioScore, d: DimKey): string {
  const c = s.perDim[d];
  if (!c) return "—";
  const mark = c.passed === 0 ? " ✗" : c.passed < c.total ? " ⚠" : "";
  return `${c.passed}/${c.total}${mark}`;
}

// Per-dimension aggregate (passed/total summed across scenarios that graded it).
// Shared by the scorecard totals row and the DB persist (persist-run.ts).
export function aggregateDims(scores: ScenarioScore[]): Record<string, { passed: number; total: number }> {
  const out: Record<string, { passed: number; total: number }> = {};
  for (const s of scores) {
    for (const [dim, c] of Object.entries(s.perDim)) {
      const cell = (out[dim] ??= { passed: 0, total: 0 });
      cell.passed += c.passed;
      cell.total += c.total;
    }
  }
  return out;
}

export function renderScorecard(scores: ScenarioScore[], meta: { k: number; model: string; at: string }): string {
  const rows = scores.map((s) =>
    `| ${s.id} | ${s.capability} | ${DIMS.map((d) => cell(s, d)).join(" | ")} | ${s.avgMs} |`);
  // Tổng pass-rate từng chiều (gộp mọi scenario có chấm chiều đó).
  const agg = aggregateDims(scores);
  const totals = DIMS.map((d) => {
    const c = agg[d];
    return c && c.total ? `${Math.round((100 * c.passed) / c.total)}%` : "—";
  });
  const fails = scores.flatMap((s) => s.fails);
  return [
    `# Eval Scorecard — ${meta.model} — ${meta.at} (k=${meta.k})`,
    `Tổng ${scores.length} scenario / ${scores.length * meta.k} lần chạy. Đo trên host, dispatch stub.`,
    "",
    `| Scenario | Chiều chính | ${HEAD.join(" | ")} | avg ms |`,
    `|---|---|${HEAD.map(() => "---").join("|")}|---|`,
    ...rows,
    `| **TỔNG (pass-rate)** | | ${totals.join(" | ")} | |`,
    "",
    "## Trượt & vì sao",
    ...(fails.length ? fails.map((f) => `- ${f}`) : ["- (không có lần trượt nào được ghi)"]),
    "",
  ].join("\n");
}

// Ghi .md + .json vào .serena/qa/ (host). Tách khỏi render để render test được thuần.
export async function writeScorecard(scores: ScenarioScore[], meta: { k: number; model: string; at: string }): Promise<string> {
  await mkdir(".serena/qa", { recursive: true });
  const base = `.serena/qa/eval-${meta.at}`;
  await writeFile(`${base}.md`, renderScorecard(scores, meta), "utf8");
  await writeFile(`${base}.json`, JSON.stringify({ meta, scores }, null, 2), "utf8");
  return `${base}.md`;
}
