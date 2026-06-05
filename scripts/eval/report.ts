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

export function renderScorecard(scores: ScenarioScore[], meta: { k: number; model: string; at: string }): string {
  const rows = scores.map((s) =>
    `| ${s.id} | ${s.capability} | ${DIMS.map((d) => cell(s, d)).join(" | ")} | ${s.avgMs} |`);
  // Tổng pass-rate từng chiều (gộp mọi scenario có chấm chiều đó).
  const totals = DIMS.map((d) => {
    let p = 0, t = 0;
    for (const s of scores) { const c = s.perDim[d]; if (c) { p += c.passed; t += c.total; } }
    return t ? `${Math.round((100 * p) / t)}%` : "—";
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
