import { afterAll, describe, test, expect } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { INTERNAL_TOOLS, modelToolSchemas } from "@/lib/agent/registry";
import type { ConnectorTool } from "@/lib/connectors/types";
import { runScenario } from "./runner";
import { makeRealOllama, ollamaCfgFromEnv } from "./ollama";
import { allConnectorSchemas, padToN } from "./scale/distractors";
import { curveTable, wilson, type CurvePoint } from "./scale/curve";
import type { Scenario } from "./types";

const K = Math.max(1, Number(process.env.EVAL_K) || 5);
const SIZES = [8, 16, 24, 40]; // ≥3 mốc (ràng buộc #2). Pool ~45 (internal+connector) đủ tới 40.
const cfg = ollamaCfgFromEnv();
const callOllama = makeRealOllama(cfg);
const at = new Date().toISOString().slice(0, 10);

// Pool distractor = ĐÚNG union prod (internal world-tools + mọi connector) — bloat THẬT model thấy.
const POOL: ConnectorTool[] = [...modelToolSchemas(INTERNAL_TOOLS, []), ...allConnectorSchemas()];
const schemaOf = (name: string): ConnectorTool =>
  modelToolSchemas([INTERNAL_TOOLS.find((t) => t.name === name)!], [])[0];

// Probe = câu 1-tool đáp-án-biết-trước. Gồm 1 probe WRITE — E0 cho thấy write fragile nhất.
const PROBES: { id: string; correct: string; scn: Scenario }[] = [
  { id: "stuck", correct: "laam_find_stuck", scn: {
    id: "scale-stuck", capability: "tool-selection", input: "Agent nào đang kẹt?",
    toolStubs: { laam_find_stuck: { stuck: [{ id: "s1", project: "billing", stuck: true }] } },
    expect: { callsTool: "laam_find_stuck" } } },
  { id: "web", correct: "web_search", scn: {
    id: "scale-web", capability: "tool-selection", input: "Tìm tin mới nhất về React 19 trên web.",
    toolStubs: { web_search: { results: [{ title: "R19", url: "https://r.dev/19", snippet: "x" }] } },
    expect: { callsTool: "web_search" } } },
  { id: "calc", correct: "util_calc", scn: {
    id: "scale-calc", capability: "tool-selection", input: "Tính chính xác 19 * 23 giúp tôi.",
    toolStubs: { util_calc: { expr: "19*23", result: 437 } }, expect: { callsTool: "util_calc" } } },
  { id: "write", correct: "trello_create_card", scn: {
    id: "scale-write", capability: "tool-selection", input: "Tạo card Trello 'Fix login' trong board Sprint.",
    toolStubs: { trello_create_card: { status: "pending_write" } }, expect: { callsTool: "trello_create_card" } } },
];

const points: CurvePoint[] = [];

describe(`eval-scale (k=${K}, sizes=${SIZES.join("/")})`, () => {
  for (const p of PROBES) {
    for (const n of SIZES) {
      test(`${p.id}@${n}`, async () => {
        // Nit 2: schema "đúng" lấy THẬT từ registry (connector qua allConnectorSchemas; internal qua schemaOf).
        const correctSchema = p.correct.startsWith("trello_")
          ? allConnectorSchemas().find((t) => t.function.name === p.correct)!
          : schemaOf(p.correct);
        const union = padToN([correctSchema], POOL, n);
        const score = await runScenario({ ...p.scn, id: `${p.scn.id}-${n}` }, { callOllama, buildTools: () => union }, K);
        const sel = score.perDim["tool-selection"] ?? { passed: 0, total: K };
        // Nit 1: mang theo noCall (tách no-call vs wrong-call).
        points.push({ probe: p.id, n, passed: sel.passed, total: sel.total, noCall: score.noCall });
        expect(score.runs).toBe(K); // measure-only: chỉ khẳng định đã chạy đủ k (KHÔNG fail theo model)
      });
    }
  }

  afterAll(async () => {
    if (!points.length) return;
    const ci = points.map((p) => {
      const [lo, hi] = wilson(p.passed, p.total);
      return `${p.probe}@${p.n}: ${p.passed}/${p.total} [${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%]`;
    });
    const md = `# Selection-at-scale — ${cfg.model} — ${at} (k=${K})\n\nPool distractor = prod union (internal world-tools + connector). Probe giữ cố định, pad distractor tới N.\n\n${curveTable(points, SIZES)}\n\n## CI 95% (Wilson)\n- ${ci.join("\n- ")}\n`;
    await mkdir(".serena/qa", { recursive: true });
    const path = `.serena/qa/eval-scale-${at}.md`;
    await writeFile(path, md, "utf8");
    console.log(`\n[eval-scale] curve → ${path}`);
  });
});
