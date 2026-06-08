import { afterAll, describe, test, expect } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { INTERNAL_TOOLS, modelToolSchemas } from "@/lib/agent/registry";
import type { ConnectorTool } from "@/lib/connectors/types";
import { runScenario } from "./runner";
import { makeRealOllama, ollamaCfgFromEnv } from "./ollama";
import { allConnectorSchemas, padToN, resolveProbeSchemas } from "./scale/distractors";
import { curveTable, wilson, type CurvePoint } from "./scale/curve";
import type { Scenario } from "./types";

const K = Math.max(1, Number(process.env.EVAL_K) || 5);
const SIZES = [8, 10, 12, 14, 16]; // knee-finding: mẫu dày trong (8,16] (24/40 đã biết 0%, bỏ — CTO Q2). 16 = neo trên.
const cfg = ollamaCfgFromEnv();
const callOllama = makeRealOllama(cfg);
const at = new Date().toISOString().slice(0, 10);

// Pool distractor = ĐÚNG union prod (internal world-tools + mọi connector) — bloat THẬT model thấy.
const POOL: ConnectorTool[] = [...modelToolSchemas(INTERNAL_TOOLS, []), ...allConnectorSchemas()];

// Probe = câu 1-tool đáp-án-biết-trước. Gồm 1 probe WRITE — E0 cho thấy write fragile nhất.
const PROBES: { id: string; correct: string | string[]; scn: Scenario }[] = [
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
  // T3 — non-trello write-probe: xác nhận lỗi-LỚP-write (không trello-đặc-thù). CTO verdict 4 bắt buộc.
  { id: "write-gmail", correct: "gmail_send", scn: {
    id: "scale-write-gmail", capability: "tool-selection", input: "Gửi email cho sếp báo cáo sprint đã xong.",
    toolStubs: { gmail_send: { status: "pending_write" } }, expect: { callsTool: "gmail_send" } } },
  // T4 — multi-tool (read+write cùng lượt): cả hai phải lọt ≤ capK (callsTool[] = tất-cả-phải-gọi, types.ts:11).
  { id: "multi-read-write", correct: ["laam_find_stuck", "trello_create_card"], scn: {
    id: "scale-multi", capability: "tool-selection", input: "Xem agent nào đang kẹt rồi tạo card Trello nhắc tôi xử lý.",
    toolStubs: { laam_find_stuck: { stuck: [{ id: "s1", project: "billing", stuck: true }] }, trello_create_card: { status: "pending_write" } },
    expect: { callsTool: ["laam_find_stuck", "trello_create_card"] } } },
];

const points: CurvePoint[] = [];

describe(`eval-scale (k=${K}, sizes=${SIZES.join("/")})`, () => {
  for (const p of PROBES) {
    for (const n of SIZES) {
      test(`${p.id}@${n}`, async () => {
        // Schema "đúng" lấy THẬT từ registry (resolveProbeSchemas: internal+connector, hỗ trợ multi-tool).
        const names = Array.isArray(p.correct) ? p.correct : [p.correct];
        const union = padToN(resolveProbeSchemas(names), POOL, n);
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
