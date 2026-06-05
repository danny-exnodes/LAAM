import { afterAll, describe, expect, test } from "vitest";
import { ALL_SCENARIOS } from "./scenarios";
import { runScenario } from "./runner";
import { makeRealOllama, ollamaCfgFromEnv } from "./ollama";
import { unionToolSchemas } from "./union-tools";
import { writeScorecard } from "./report";
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
    if (scores.length) {
      const path = await writeScorecard(scores, { k: K, model: cfg.model, at });
      console.log(`\n[eval] scorecard → ${path}`);
    }
  });
});
