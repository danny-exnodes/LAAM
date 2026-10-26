// Đo độ chính xác CHỌN TOOL theo SỐ LƯỢNG tool khả dụng. Host-only (gọi model thật).
//
// Chạy đúng điều kiện production (60 tool, model đang dùng trên /chat + /constellation):
//   set -a; source .env; set +a
//   EVAL_PROVIDER=byteplus EVAL_MODEL=gpt-oss-120b EVAL_SIZES=4,16,32,60 EVAL_K=3 \
//     npx vitest run -c vitest.eval.config.ts scripts/eval/suite.scale.eval.ts
// Không set EVAL_PROVIDER ⇒ Ollama + DEFAULT_CHAT_MODEL (hành vi cũ).
// Fixture tool MCP hết hạn (đổi server/đổi bộ tool) → chụp lại bằng scale/snapshot-mcp-pool.ts.
import { afterAll, describe, test, expect } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { INTERNAL_TOOLS, modelToolSchemas } from "@/lib/agent/registry";
import type { ConnectorTool } from "@/lib/connectors/types";
import { runScenario } from "./runner";
import { pickEvalProvider } from "./provider";
import { allConnectorSchemas, padToN } from "./scale/distractors";
import { loadMcpPool, resolveFromPools } from "./scale/mcp-pool";
import { bigMasterRecord } from "./scale/realistic-payload";
import { curveTable, wilson, type CurvePoint } from "./scale/curve";
import type { Scenario } from "./types";

const K = Math.max(1, Number(process.env.EVAL_K) || 5);
// Mốc đo tới QUY MÔ THẬT. Trước đây dừng ở 16 vì pool chỉ có connector built-in; nay pool
// gồm cả tool MCP nên đo được đúng cái production đang đưa cho model (60 = 12 internal +
// 48 MCP). Đổi mốc qua EVAL_SIZES="4,16,60" khi cần chạy nhanh.
const SIZES = (process.env.EVAL_SIZES ?? "4,16,32,60")
  .split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);
const prov = pickEvalProvider();
const callOllama = prov.caller;
const at = new Date().toISOString().slice(0, 10);

// Pool distractor = ĐÚNG union prod: internal world-tools + mọi connector + tool MCP thật
// (fixture chụp từ server MCP đang cắm — xem scale/mcp-pool.ts). Thiếu phần MCP thì không
// dựng lại được điều kiện thật: 48/60 tool model thấy hằng ngày đến từ đó.
const MCP_POOL: ConnectorTool[] = loadMcpPool();
const POOL: ConnectorTool[] = [...modelToolSchemas(INTERNAL_TOOLS, []), ...allConnectorSchemas(), ...MCP_POOL];

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
  // bare-write trello — 1a″ FIX: prompt cho idList HỢP LỆ (trello_create_card required ["idList","name"], trello.ts:118).
  // (bản trước "board Sprint" = TÊN không phải list-ID → model ĐÚNG khi do dự → "crater" = cùng artifact thiếu-arg như gmail.)
  { id: "write", correct: "trello_create_card", scn: {
    id: "scale-write", capability: "tool-selection", input: "Tạo card Trello tên 'Fix login' vào list có id 'lst_5f2a9'.",
    toolStubs: { trello_create_card: { status: "pending_write" } }, expect: { callsTool: "trello_create_card" } } },
  // non-trello bare-write — #1a′ FIX: prompt đủ to/subject/body (gmail_send required) → probe HỢP LỆ.
  // (bản trước "gửi cho sếp" thiếu recipient → model ĐÚNG khi không gọi → 0% = artifact, KHÔNG phải write-class.)
  { id: "write-gmail", correct: "gmail_send", scn: {
    id: "scale-write-gmail", capability: "tool-selection",
    input: "Gửi email tới boss@acme.com, tiêu đề 'Báo cáo sprint', nội dung 'Sprint đã xong'.",
    toolStubs: { gmail_send: { status: "pending_write" } }, expect: { callsTool: "gmail_send" } } },
  // 1a″ — bare-write #3 (gcal, args đủ summary/start/end, gcal.ts:114) → write-class confirm ở n≥3 clean writes.
  { id: "write-gcal", correct: "gcal_create_event", scn: {
    id: "scale-write-gcal", capability: "tool-selection",
    input: "Tạo sự kiện Google Calendar tiêu đề 'Họp sprint', bắt đầu 2026-06-10T15:00:00, kết thúc 2026-06-10T16:00:00.",
    toolStubs: { gcal_create_event: { status: "pending_write" } }, expect: { callsTool: "gcal_create_event" } } },
  // bare-write #4 (github, args đủ owner/repo/title — github.ts:169) — mở write-class ra ngoài trello/gmail/gcal.
  { id: "write-github", correct: "github_create_issue", scn: {
    id: "scale-write-github", capability: "tool-selection",
    input: "Tạo issue trên repo 'web' của owner 'acme', tiêu đề 'Login bug'.",
    toolStubs: { github_create_issue: { status: "pending_write" } }, expect: { callsTool: "github_create_issue" } } },
  // bare-write #5 (demo, chỉ required title — demo.ts:45) — write tool đơn-arg, baseline dễ nhất; tách "khó vì nhiều arg" khỏi "khó vì là write".
  { id: "write-demo", correct: "demo_create_task", scn: {
    id: "scale-write-demo", capability: "tool-selection",
    input: "Tạo task tên 'Review PR #42'.",
    toolStubs: { demo_create_task: { status: "pending_write" } }, expect: { callsTool: "demo_create_task" } } },
  // T4 — multi-tool (read+write cùng lượt): cả hai phải lọt ≤ capK (callsTool[] = tất-cả-phải-gọi, types.ts:11).
  // BUG PROBE (đã sửa 2026-08-03): thiếu `idList` — trello_create_card required ["idList","name"]
  // (trello.ts:139) nhưng câu hỏi không hề cho biết list nào. 3 probe multi-tool bên dưới ra 0%
  // TUYỆT ĐỐI qua 4 lần chạy độc lập — soi trace phát hiện model KHÔNG hỏng: nó dừng đúng lúc để
  // hỏi lại "cần biết ID danh sách nào" thay vì bịa, đúng quy tắc chống bịa trong system prompt
  // (Rule 13). Đây CÙNG loại artifact mà probe "write" đơn lẻ đã né (xem comment "1a″ FIX" phía
  // trên) — bản sửa đó không áp dụng cho 3 probe này. Thêm idList → xác nhận bằng tay 8/8 pass.
  { id: "multi-read-write", correct: ["laam_find_stuck", "trello_create_card"], scn: {
    id: "scale-multi", capability: "tool-selection", input: "Xem agent nào đang kẹt rồi tạo card Trello vào list có id 'lst_5f2a9' nhắc tôi xử lý.",
    toolStubs: { laam_find_stuck: { stuck: [{ id: "s1", project: "billing", stuck: true }] }, trello_create_card: { status: "pending_write" } },
    expect: { callsTool: ["laam_find_stuck", "trello_create_card"] } } },
  // #1a′ — contextualized-write ĐA DẠNG (cùng multi-read-write → n≥3): kiểm write VỮNG khi theo sau read, đủ context.
  { id: "ctx-audit-write", correct: ["laam_query_audit", "trello_create_card"], scn: {
    id: "scale-ctx-audit", capability: "tool-selection", input: "Tra audit log gần đây rồi tạo card Trello vào list có id 'lst_5f2a9' nhắc review các thay đổi rủi ro.",
    toolStubs: { laam_query_audit: { events: [{ id: "a1", action: "connector.write", at: "2026-06-08" }] }, trello_create_card: { status: "pending_write" } },
    expect: { callsTool: ["laam_query_audit", "trello_create_card"] } } },
  { id: "ctx-web-write", correct: ["web_search", "trello_create_card"], scn: {
    id: "scale-ctx-web", capability: "tool-selection", input: "Tìm tin mới nhất về sự cố Cloudflare rồi tạo card Trello vào list có id 'lst_5f2a9' để theo dõi xử lý.",
    toolStubs: { web_search: { results: [{ title: "CF outage", url: "https://x.dev/cf", snippet: "..." }] }, trello_create_card: { status: "pending_write" } },
    expect: { callsTool: ["web_search", "trello_create_card"] } } },
  // MCP read đơn — dạng câu "liệt kê" đã chạy đúng trên production; ở đây làm mốc so sánh
  // cho probe dưới (cùng miền dữ liệu, khác số bước).
  { id: "mcp-list", correct: "mcp__daab__kg_list_projects", scn: {
    id: "scale-mcp-list", capability: "tool-selection", input: "Liệt kê các project có trong DAAB.",
    toolStubs: { mcp__daab__kg_list_projects: { projects: [{ id: "fd47-dasin", name: "Dasin", status: "active" }] } },
    expect: { callsTool: "mcp__daab__kg_list_projects" } } },
  // MCP 2 bước — ĐÚNG ca hỏng đã đo trên production: hỏi chi tiết một đối tượng thì phải
  // liệt kê lấy id rồi mới đọc bản ghi chi tiết. Các lượt hỏng hoặc dừng sau bước 1, hoặc
  // gọi sai tool. Probe này đo khả năng tự chọn của model (drilldown xác định KHÔNG bật ở
  // eval) → nó chính là thước đo cho việc thu hẹp action space.
  { id: "mcp-detail", correct: ["mcp__daab__kg_list_projects", "mcp__daab__kg_get_master_record"], scn: {
    id: "scale-mcp-detail", capability: "tool-selection", input: "Cho mình thông tin chi tiết project Dasin.",
    toolStubs: {
      mcp__daab__kg_list_projects: { projects: [{ id: "fd47-dasin", name: "Dasin", status: "active" }] },
      mcp__daab__kg_get_master_record: { record: { summary: "Công ty TNHH Đại Tân", risks: ["r1"], recommendations: ["a1"] } },
    },
    expect: { callsTool: ["mcp__daab__kg_list_projects", "mcp__daab__kg_get_master_record"] } } },
  // BIẾN THỂ VOICE, payload cỡ THẬT — lần chạy đầu (2026-08-03, xem .serena/qa/eval-scale-*)
  // đo `mcp-detail` (mode mặc định = text, stub vài trăm byte) ra 100% ở mọi mốc, TRÁI với
  // ~18% lượt hỏng đo được thật trên /constellation. Khác biệt: production dùng mode="voice"
  // (VOICE_GUIDE — chính thứ đã sửa ở fix #1) và tool result thật ~46-78k ký tự, không phải
  // vài trăm byte. Probe này khép cả hai khác biệt để so sánh trực tiếp với `mcp-detail`.
  { id: "mcp-detail-voice", correct: ["mcp__daab__kg_list_projects", "mcp__daab__kg_get_master_record"], scn: {
    id: "scale-mcp-detail-voice", capability: "tool-selection", input: "Cho mình thông tin chi tiết project Dasin.",
    mode: "voice",
    toolStubs: {
      mcp__daab__kg_list_projects: { projects: [{ id: "fd47-dasin", name: "Dasin", status: "active" }] },
      mcp__daab__kg_get_master_record: { text: bigMasterRecord(46_000) }, // shape MCP thật: { text: "<json>" }
    },
    expect: { callsTool: ["mcp__daab__kg_list_projects", "mcp__daab__kg_get_master_record"] } } },
  // LỊCH SỬ NHIỄM — biến còn lại chưa khép giữa eval và production (xem .serena/qa/eval-scale-*
  // và CHANGELOG). Câu trả lời nông này COPY NGUYÊN VĂN từ log production thật (ca hỏng đo được
  // ngày 2026-08-03): model dừng sau kg_list_projects, trả lời bằng đúng mấy trường tổng quan.
  // route.ts replay lịch sử CHỈ text (không tool result) — mô phỏng đúng shape đó bằng
  // priorMessages. Kỳ vọng vẫn là hành vi ĐÚNG (gọi lại cả 2 tool để lấy dữ liệu MỚI, không
  // dùng lại câu trả lời cũ) — pass-rate ở đây đo model có PHỤC HỒI được sau một lượt nông
  // trước đó hay không, khác hẳn câu hỏi "chọn tool đúng ở lượt sạch" mà mcp-detail-voice đo.
  { id: "mcp-detail-poisoned", correct: ["mcp__daab__kg_list_projects", "mcp__daab__kg_get_master_record"], scn: {
    id: "scale-mcp-detail-poisoned", capability: "tool-selection", input: "Cho mình thông tin chi tiết project Dasin",
    mode: "voice",
    priorMessages: [
      { role: "user", content: "Cho mình thông tin chi tiết project Dasin" },
      { role: "assistant", content: "Dự án Dasin hiện đang hoạt động, được tạo vào ngày 21‑tháng‑7‑2026 khoảng 02 giờ 25 phút (theo UTC). Không có mô tả hay địa chỉ repo được thiết lập cho nó." },
    ],
    toolStubs: {
      mcp__daab__kg_list_projects: { projects: [{ id: "fd47-dasin", name: "Dasin", status: "active" }] },
      mcp__daab__kg_get_master_record: { text: bigMasterRecord(46_000) },
    },
    expect: { callsTool: ["mcp__daab__kg_list_projects", "mcp__daab__kg_get_master_record"] } } },
  // Biến thể ĐÚNG kịch bản người dùng báo cáo: lượt nhiễm xảy ra ở VOICE, người dùng chuyển
  // sang chat THỦ CÔNG (text) để hỏi lại — xác nhận bằng tay đầu phiên là vẫn nông. mode hiện
  // tại đổi thành "text", priorMessages giữ nguyên (đúng: history không mang theo mode cũ).
  { id: "mcp-detail-poisoned-switch-to-text", correct: ["mcp__daab__kg_list_projects", "mcp__daab__kg_get_master_record"], scn: {
    id: "scale-mcp-detail-poisoned-text", capability: "tool-selection", input: "Cho mình thông tin chi tiết project Dasin",
    mode: "text",
    priorMessages: [
      { role: "user", content: "Cho mình thông tin chi tiết project Dasin" },
      { role: "assistant", content: "Dự án Dasin hiện đang hoạt động, được tạo vào ngày 21‑tháng‑7‑2026 khoảng 02 giờ 25 phút (theo UTC). Không có mô tả hay địa chỉ repo được thiết lập cho nó." },
    ],
    toolStubs: {
      mcp__daab__kg_list_projects: { projects: [{ id: "fd47-dasin", name: "Dasin", status: "active" }] },
      mcp__daab__kg_get_master_record: { text: bigMasterRecord(46_000) },
    },
    expect: { callsTool: ["mcp__daab__kg_list_projects", "mcp__daab__kg_get_master_record"] } } },
];

const points: CurvePoint[] = [];

describe(`eval-scale (k=${K}, sizes=${SIZES.join("/")})`, () => {
  for (const p of PROBES) {
    for (const n of SIZES) {
      test(`${p.id}@${n}`, async () => {
        // Schema "đúng" lấy THẬT từ registry (resolveProbeSchemas: internal+connector, hỗ trợ multi-tool).
        const names = Array.isArray(p.correct) ? p.correct : [p.correct];
        const union = padToN(names.map((nm) => resolveFromPools(nm, [modelToolSchemas(INTERNAL_TOOLS, []), allConnectorSchemas(), MCP_POOL])), POOL, n);
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
    const md = `# Selection-at-scale — ${prov.label} — ${at} (k=${K})\n\nPool distractor = prod union (internal world-tools + connector + ${MCP_POOL.length} tool MCP thật). Probe giữ cố định, pad distractor tới N.\n\n${curveTable(points, SIZES)}\n\n## CI 95% (Wilson)\n- ${ci.join("\n- ")}\n`;
    await mkdir(".serena/qa", { recursive: true });
    const path = `.serena/qa/eval-scale-${at}.md`;
    await writeFile(path, md, "utf8");
    console.log(`\n[eval-scale] curve → ${path}`);
  });
});
