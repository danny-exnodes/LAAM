import { afterAll, describe, expect, test } from "vitest";
import { execSync } from "node:child_process";
import { ALL_SCENARIOS } from "./scenarios";
import { runScenario } from "./runner";
import { makeRealOllama, ollamaCfgFromEnv } from "./ollama";
import { unionToolSchemas } from "./union-tools";
import { writeScorecard } from "./report";
import { persistEvalRun } from "./persist-run";
import type { ScenarioScore } from "./types";

const K = Math.max(1, Number(process.env.EVAL_K) || 5);
const cfg = ollamaCfgFromEnv();
const callOllama = makeRealOllama(cfg);
// Ngày truyền vào (Date.now() bị cấm trong workflow scripts, nhưng đây là vitest thường → OK).
const at = new Date().toISOString().slice(0, 10);
const scores: ScenarioScore[] = [];

describe(`eval (k=${K}, model=${cfg.model})`, () => {
  for (const s of ALL_SCENARIOS) {
    test(s.id, async () => {
      const score = await runScenario(s, { callOllama, buildTools: unionToolSchemas }, K);
      scores.push(score);
      // MEASUREMENT, không phải pass/fail theo model: chỉ khẳng định đã chạy đủ k lần.
      // Pass-rate thật nằm trong scorecard (đừng để vitest "đỏ" vì model yếu).
      expect(score.runs).toBe(K);
    });
  }

  afterAll(async () => {
    if (!scores.length) return;
    const path = await writeScorecard(scores, { k: K, model: cfg.model, at });
    console.log(`\n[eval] scorecard → ${path}`);
    // Best-effort: persist to DB for the /eval page. Never fail the run on DB issues.
    try {
      const label = process.env.EVAL_LABEL || null;
      let gitSha: string | null = null;
      try { gitSha = execSync("git rev-parse --short HEAD").toString().trim(); } catch { /* no git */ }
      await persistEvalRun({ k: K, model: cfg.model, at }, scores, { label, gitSha });
      console.log(`[eval] persisted run to DB (label=${label ?? "—"})`);
    } catch (e) {
      console.warn("[eval] DB persist skipped (fail-soft):", e instanceof Error ? e.message : e);
    }
  });
});
