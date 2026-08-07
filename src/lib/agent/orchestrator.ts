// L0 — vòng tool-call (run-until-done, non-streaming). Chuyển từ /api/chat, đổi
// execute→dispatch. onEvent phát ở makeDispatch (chokepoint), không lặp ở đây.
import type { ConnectorTool } from "@/lib/connectors/types";
import { evictOldToolResults } from "./loop-context";
import { planDrilldown, type DrilldownPair } from "./drilldown";
import { PendingWriteSignal } from "@/lib/agent/safety/gate";
import { deriveFromToolResult, worthShowing, viewKey, type ViewDescriptor } from "./view";
import { annotateEmptyResult } from "./empty-result";
import { digestMessagesForModel } from "./digest";
import { queryTextFromArgs } from "./empty-result";

// W3 vision: `images` = raw base64 (không prefix data:) trên message user — format
// Ollama multimodal. Optional/additive: vắng mặt ⇒ wire-format y như cũ.
export type ChatMessage = { role: string; content: string; images?: string[]; tool_calls?: unknown[] };
type OllamaToolCall = { function?: { name?: string; arguments?: unknown } };
type OllamaChatMessage = { role?: string; content?: string; tool_calls?: OllamaToolCall[] };
export type OllamaChatResponse = { message?: OllamaChatMessage };

export type ToolRoundsDeps = {
  callOllama: (messages: ChatMessage[], tools: ConnectorTool[]) => Promise<OllamaChatResponse>;
  dispatch: (name: string, args: unknown) => Promise<unknown>;
};

// QW-3: web_search hay trả URL nhưng model dễ trả lời ngay từ trích đoạn thay vì
// đọc sâu. Sau khi một web_search ra kết quả có URL (và convo chưa từng web_read),
// chèn 1 gợi ý ngắn nhắc model web_read trước khi kết luận. Chỉ 1 lần/lượt, và chỉ
// khi thật sự đã web_search → đường chat thường (không web_search) không bị động.
const WEB_READ_NUDGE =
  "Bạn có thể gọi web_read với một URL ở trên để đọc nội dung đầy đủ trước khi trả lời.";

// G4 grounding guard: model trả lời NGAY ở vòng 0 với 0 tool call trong khi tool đọc
// dữ liệu thật đang có sẵn → câu trả lời đó không có gì chống lưng (đo trên gpt-oss-120b:
// có lượt bịa nguyên hồ sơ một dự án, kèm cả tên người phụ trách). Hỏi lại ĐÚNG MỘT lần
// với lời nhắc này. Điều kiện kích hoạt thuần CẤU TRÚC (vòng 0 + 0 tool call + có tool),
// KHÔNG phân loại ý định người dùng bằng model hay bằng danh sách từ khoá (Rule 5).
// Vế "nếu không cần thì trả lời trực tiếp" là đường thoát cho chitchat: câu chào vẫn
// được trả lời thẳng, chỉ tốn thêm một vòng ngắn (đo: lượt chitchat ~1.5-1.8s).
// G5 data-fetch guard: đo thực tế trên gpt-oss-120b (2026-08-05, bộ 12 câu DAAB) — 2/3 lượt
// hỏi "cửa hàng nào lệch tồn kho cao nhất" model gọi describe_table BỐN lần để đọc cấu trúc
// bảng rồi kết luận "không có dữ liệu thực tế" và dừng, KHÔNG hề gọi tool truy vấn dữ liệu lần
// nào. G4 không bắt được vì lượt đó CÓ gọi tool. Điều kiện kích hoạt thuần CẤU TRÚC (lượt sắp
// kết thúc + đã gọi tool + không tool nào thuộc nhóm "lấy dữ liệu"), KHÔNG phân loại ý định hay
// đọc nội dung câu trả lời (Rule 5). Danh sách tool "lấy dữ liệu" đến từ env chứ không hardcode
// — LAAM không được biết tên tool của riêng connector nào (cùng lý do với TOOL_DRILLDOWN_PAIRS).
// Không đặt env ⇒ tính năng tắt hẳn, hành vi y như cũ.
const DATA_FETCH_NUDGE =
  "Bạn mới xem cấu trúc/danh sách chứ chưa truy vấn dữ liệu thật. Hãy gọi công cụ truy vấn dữ liệu để lấy số liệu thực tế rồi mới trả lời; nếu câu hỏi thực sự không cần dữ liệu thì trả lời trực tiếp.";
// G5 nhắc chung ("hãy gọi tool truy vấn dữ liệu") không đủ mạnh khi model đã tự thuyết phục
// bản thân bằng laam_query_audit — đo được model đọc audit log RIÊNG của LAAM (0-vài dòng
// agent_write), kết luận "không có dữ liệu", rồi GIỮ NGUYÊN kết luận đó ngay cả sau khi nhắc
// chung và/hoặc sau khi tự gọi thêm tool DAAB thật (không tổng hợp lại từ kết quả mới, vẫn bám
// kết luận ban đầu). Tên tool literal ở đây khớp CHÍNH XÁC `laam_query_audit.name` trong
// tools/laam/query-audit.ts — không import trực tiếp file đó vì nó kéo theo @/db/drizzle-orm
// vào orchestrator.ts, phá vỡ tiền đề "không cần mock module nào" mà orchestrator.test.ts dựa
// vào (xem comment đầu file test). Cùng tiền lệ với "web_read" đã hardcode literal ở file này.
const LAAM_AUDIT_TOOL_NAME = "laam_query_audit";
// ĐO ĐƯỢC (2026-08-05, 4 lượt retest): nhắc chung chung "gọi tool truy vấn data source" đôi khi
// vẫn không đủ — model bị nhắc xong lại quay ra dò thêm cấu trúc (describe_table) thay vì gọi
// thẳng tool dữ liệu, dùng hết nốt số vòng còn lại. Nêu ĐÍCH DANH tên tool (lấy từ chính
// dataFetchTools đã cấu hình — không hardcode) để không còn chỗ cho model "thăm dò thêm".
function auditMisuseNudge(dataFetchTools: ReadonlySet<string>): string {
  const names = Array.from(dataFetchTools).join(", ");
  return (
    "Nhật ký bạn vừa đọc (laam_query_audit) CHỈ là hành động của chính bạn trong hệ thống LAAM — KHÔNG phải dữ liệu nghiệp vụ của khách hàng. " +
    `Gọi NGAY một trong các công cụ sau để lấy dữ liệu nghiệp vụ thật: ${names}. ` +
    "KHÔNG dò thêm cấu trúc bảng nữa, KHÔNG gọi lại laam_query_audit, và đừng kết luận 'không có dữ liệu' chỉ dựa trên laam_query_audit."
  );
}
// G5 cần TỐI THIỂU 2 vòng còn lại SAU lượt nhắc để có tác dụng (1 để model gọi tool dữ liệu,
// 1 để tổng hợp câu trả lời ở vòng chót bị ép tools=[]) — nhắc mà không còn đủ vòng thì vô ích,
// coi như không có G5. Đặt lead = 3 (thay vì đúng-2-tối-thiểu) để chừa thêm 1 vòng đệm cho câu
// hỏi cần soạn tool-call phức tạp.
const DATA_FETCH_NUDGE_LEAD_ROUNDS = 3;

const GROUNDING_NUDGE =
  "Câu hỏi này có thể cần dữ liệu thật từ hệ thống. Nếu cần, hãy gọi công cụ phù hợp trước khi trả lời; nếu không cần thì trả lời trực tiếp.";

// Kết quả web_search có chứa URL không? (shape: { results: [{ url, ... }] })
function searchResultHasUrl(result: unknown): boolean {
  const results = (result as { results?: unknown } | null)?.results;
  return Array.isArray(results) && results.some((r) => Boolean((r as { url?: unknown })?.url));
}

// convo (lịch sử có sẵn) đã từng gọi web_read chưa? web_read chỉ xuất hiện như tên
// tool_call trong message assistant — quét để không nhắc lại nếu đã đọc ở lượt trước.
function convoHasWebRead(convo: ChatMessage[]): boolean {
  return convo.some((m) =>
    Array.isArray(m.tool_calls) &&
    m.tool_calls.some((tc) => (tc as OllamaToolCall)?.function?.name === "web_read"),
  );
}

// P1 quick-tools: user đã CHỌN tool tường minh trên UI → code dispatch deterministic
// (Rule 5 — không bắt model đoán selection/args). Đi qua CÙNG dispatch withSafety:
// write vẫn ném PendingWriteSignal → confirm-card y hệt. Shape message GIỐNG HỆT
// tool-turn của runToolRounds để extractToolTurns/deriveCitations/persist thấy như nhau.
export type RequestedTool = { name: string; args: Record<string, unknown> };

export async function seedRequestedTool(
  convo: ChatMessage[],
  rt: RequestedTool,
  dispatch: ToolRoundsDeps["dispatch"],
): Promise<void> {
  convo.push({ role: "assistant", content: "", tool_calls: [{ function: { name: rt.name, arguments: rt.args } }] });
  const result = await dispatch(rt.name, rt.args);
  convo.push({ role: "tool", content: JSON.stringify(annotateEmptyResult(result, rt.args)) });
}

// Runaway BACKSTOP on tool rounds — NOT a task-shaping cap. The loop's real exit is
// natural completion (model returns no tool calls). 25 matches LangGraph's
// recursion_limit default: high enough that legitimate multi-step tasks ("summarize 10
// emails then send") finish on their own, low enough to halt a runaway. The route can
// override via CHAT_MAX_ROUNDS; clamped so it can't be set absurdly high.
export const DEFAULT_MAX_ROUNDS = 25;
const MAX_ROUNDS_CEILING = 50; // hard safety ceiling — env CHAT_MAX_ROUNDS can raise the default up to here
const REPEAT_THRESHOLD = 3; // same tool+args this many times → stuck → stop, answer with what we have
// Polling tools (tên đuôi `_status`: kg_query_datasource_status, kg_index_status, …) lặp
// CÙNG args là hành vi hợp lệ trong lúc chờ job async — ngưỡng 3 từng cắt oan turn phân
// tích giữa chuỗi poll. Vẫn phải có trần (job không bao giờ xong = kẹt thật) nên chỉ nâng
// ngưỡng, không miễn trừ hẳn.
const POLL_REPEAT_THRESHOLD = 8;
const repeatThresholdFor = (name: string): number =>
  name.endsWith("_status") ? POLL_REPEAT_THRESHOLD : REPEAT_THRESHOLD;
// Default in-loop eviction budget — sized for the local 16k model (≈ route's
// REPLAY_BUDGET_CHARS). The route passes a much larger budget for big-context providers.
const DEFAULT_TOOL_BUDGET_CHARS = 37_000;

export type BackstopReason = "rounds" | "repeat";

export type ToolRoundsOpts = {
  drilldownPairs?: DrilldownPair[]; // D2: cặp "tool liệt kê → tool chi tiết" (config, mặc định tắt)
  maxRounds?: number;
  budgetChars?: number; // evict oldest tool results when the convo exceeds this
  keepRecent?: number; // tool results kept verbatim during eviction (default 3)
  // Fired when the loop is FORCE-terminated, not on natural completion. The reason is
  // NOT cosmetic: "rounds" (hit maxRounds) and "repeat" (same tool+args stalled) call for
  // opposite operator responses — raise CHAT_MAX_ROUNDS vs. investigate a stuck tool that
  // more rounds would never have rescued. Undiscriminated, a repeat-stall reads as "cap
  // too low" and gets mis-tuned forever.
  onBackstop?: (reason: BackstopReason) => void;
  // Panel hiển thị: gom descriptor suốt lượt, phát ĐÚNG 1 lần sau khi vòng lặp kết
  // thúc. Không phát sau mỗi dispatch — một lượt có thể có hàng chục tool result và
  // panel sẽ nhảy loạn rồi dừng ở kết quả tình cờ cuối cùng.
  onView?: (d: ViewDescriptor) => void;
  // G5: tên các tool THỰC SỰ lấy dữ liệu (vs. tool đọc cấu trúc/liệt kê). Lượt nào chỉ gọi
  // tool ngoài tập này rồi dừng sẽ bị nhắc đúng 1 lần. Vắng mặt/rỗng ⇒ guard tắt.
  dataFetchTools?: ReadonlySet<string>;
};

// Stable key for repeat-detection: tool name + normalized args (object OR JSON string).
// Keyed on tool+args (never tool alone) so reading 10 different emails — 10 distinct
// args — never trips the guard; only the SAME call repeated does.
function stableArgs(args: unknown): string {
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args ?? {});
  } catch {
    return "{}";
  }
}

const repeatFeedback = (name: string, n: number) =>
  `Bạn đã gọi "${name}" với cùng tham số ${n} lần — kết quả sẽ không đổi. Hãy đổi cách tiếp cận hoặc trả lời với dữ liệu hiện có.`;

// gpt-oss-120b qua BytePlus đôi khi trả tool_calls[].function.name dính rác từ định
// dạng harmony nội bộ của chính model. Đo được BA dạng khác nhau, mỗi dạng cần một
// cách sửa riêng — validNames luôn là chính danh sách tool đã đưa cho model nên
// không thể đoán nhầm sang một tool khác đang tồn tại:
//   (a) rác có ký tự đặc biệt phân cách — "kg_list_projects[]",
//       "kg_query_datasource_status<|channel|>commentary" → cắt tại ký tự đặc biệt đầu tiên.
//   (b) rác dính liền chữ/số, KHÔNG có ký tự đặc biệt để cắt — "kg_list_datasourcesjson"
//       (hậu tố "json" dính thẳng, có thể từ token response_format rò rỉ) → so khớp TIỀN TỐ
//       dài nhất trong validNames.
//   (c) rác ĐỔI ký tự giữa chuỗi — "mcp__daab-michael-pharmacy_chain__kg_list_datasources"
//       (dấu gạch ngang "-" trong tên connector bị đổi thành "_") → so khớp sau khi chuẩn hoá
//       "-"/"_" về cùng một ký tự ở cả hai phía.
// Ba bước chạy TUẦN TỰ, dừng ngay khi khớp — thứ tự từ chắc chắn nhất (khớp nguyên) đến
// khoan dung nhất (chuẩn hoá ký tự), tránh sửa nhầm khi bước trước đã đủ.
function sanitizeToolCallName(rawName: string, validNames: ReadonlySet<string>): string {
  if (validNames.has(rawName)) return rawName;

  const warn = (cleaned: string) => {
    console.warn(`[orchestrator] tool_call name dính rác, đã sửa: "${rawName}" → "${cleaned}"`);
    return cleaned;
  };

  // (a) cắt tại ký tự đầu tiên không phải chữ/số/gạch dưới/gạch ngang.
  const cut = rawName.search(/[^A-Za-z0-9_-]/);
  const symbolCut = cut === -1 ? rawName : rawName.slice(0, cut);
  if (validNames.has(symbolCut)) return warn(symbolCut);

  // (b) tiền tố hợp lệ DÀI NHẤT khớp với phần đầu chuỗi (đã cắt rác ký tự đặc biệt ở (a),
  // nếu có) — bắt hậu tố rác dính liền chữ/số mà (a) không cắt được.
  let longestPrefix = "";
  for (const name of validNames) {
    if (symbolCut.startsWith(name) && name.length > longestPrefix.length) longestPrefix = name;
  }
  if (longestPrefix) return warn(longestPrefix);

  // (c) chuẩn hoá "-"/"_" về cùng ký tự rồi so khớp — bắt trường hợp model đổi lẫn hai
  // ký tự đó ở giữa tên (thường ở phần tên connector do người dùng đặt, có cả hai ký tự).
  const normalize = (s: string) => s.replace(/[-_]/g, "_");
  const normalizedRaw = normalize(symbolCut);
  for (const name of validNames) {
    if (normalize(name) === normalizedRaw) return warn(name);
  }

  return rawName; // không khớp gì — giữ nguyên, gate vẫn fail-closed nếu thật sự lạ
}

// Run the agentic tool-loop until the model NATURALLY stops calling tools (the primary
// exit) — so multi-step tasks actually finish — bounded only by real safety limits: a
// high round backstop, in-loop context eviction (long runs don't overflow the model),
// and repeat-call detection. A write tool still throws PendingWriteSignal out of here
// (uncaught) → the route suspends for confirmation. onBackstop fires only when the loop
// is force-ended (backstop round or a stuck repeat), so the caller can flag the answer
// as possibly-incomplete (fail loud).
export async function runToolRounds(
  messages: ChatMessage[],
  tools: ConnectorTool[],
  deps: ToolRoundsDeps,
  opts: ToolRoundsOpts = {},
): Promise<ChatMessage[]> {
  const maxRounds = Math.max(1, Math.min(opts.maxRounds ?? DEFAULT_MAX_ROUNDS, MAX_ROUNDS_CEILING));
  const budgetChars = opts.budgetChars ?? DEFAULT_TOOL_BUDGET_CHARS;
  const keepRecent = opts.keepRecent ?? 3;
  let convo: ChatMessage[] = messages.slice();
  let webReadNudged = convoHasWebRead(convo);
  let groundingNudged = false; // G4: one-shot latch — nhắc grounding tối đa 1 lần/lượt
  const dataFetchTools = opts.dataFetchTools ?? new Set<string>();
  let dataFetchNudged = false; // G5: one-shot latch, cùng lý do với G4
  let calledDataFetchTool = false; // G5: lượt này đã chạm tool lấy dữ liệu thật chưa
  let calledAuditTool = false; // G5: lượt này có gọi laam_query_audit không (đổi nội dung nhắc)
  let auditMisuseNudged = false; // G5: latch RIÊNG cho nhắc audit-misuse (xem readyAuditMisuse)
  const drilldownPairs = opts.drilldownPairs ?? [];
  // Câu hỏi của lượt này = message user CUỐI trong lịch sử truyền vào (drilldown khớp tên
  // theo câu người dùng vừa hỏi, không phải theo cả hội thoại).
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  let drilledDown = false;
  // A turn can run the SAME query twice (measured: "show every refund…" produced two identical
  // 50/62 tables). Showing the user the same table twice is noise, so emit each shape once.
  const emittedViews = new Set<string>();
  const emitViewOnce = (d: ViewDescriptor) => {
    const k = viewKey(d);
    if (emittedViews.has(k)) return;
    emittedViews.add(k);
    opts.onView?.(d);
  };
  const seen = new Map<string, number>(); // repeat-detection: tool+args → count
  // Đếm SỐ LẦN dispatch() thật sự chạy trong lượt (không tính lần bị chặn bởi
  // repeat-detection). 1 lần = tra cứu thoáng qua để trả lời bằng lời, không đáng hiện
  // panel; ≥2 lần = model đang đào sâu (vd. list→detail), panel mới đáng xem. Luật thuần
  // đếm số bước, không đọc nội dung câu hỏi/câu trả lời (Rule 5).
  let toolCallCount = 0;
  const validToolNames = new Set(tools.map((t) => t.function.name));

  for (let i = 0; i < maxRounds; i++) {
    const isLastRound = i === maxRounds - 1; // ONLY the backstop forces a text answer
    // Big tool results reach the MODEL reduced; `convo` itself keeps them whole. Doing it here
    // — on a copy, at the wire boundary — rather than on the stored messages is what keeps the
    // rows available to the panel and to chat_tool_call, so a reloaded conversation can still
    // show its tables (see digest.ts). It also re-applies on EVERY round, so a large result
    // stays small on each replay instead of only the first.
    const res = await deps.callOllama(digestMessagesForModel(convo), isLastRound ? [] : tools);
    const msg = res?.message ?? {};
    const rawCalls = isLastRound ? [] : Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    // Sửa TÊN trước khi lưu vào convo — nếu không, lượt sau model thấy lại chính tên
    // rác của nó trong lịch sử và có xu hướng lặp lại kiểu hỏng đó.
    const calls = rawCalls.map((tc) =>
      tc.function
        ? { ...tc, function: { ...tc.function, name: sanitizeToolCallName(tc.function.name ?? "", validToolNames) } }
        : tc,
    );
    if (calls.length) {
      convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      let sawWebSearchWithUrl = false;
      let stuck = false;
      for (const tc of calls) {
        const name = tc.function?.name ?? "";
        const args = tc.function?.arguments;
        const count = (seen.get(name + "|" + stableArgs(args)) ?? 0) + 1;
        seen.set(name + "|" + stableArgs(args), count);
        if (count >= repeatThresholdFor(name)) {
          // Stuck on the same call — don't re-dispatch (result won't change); tell the
          // model, then end the loop gracefully so it answers with what it has.
          convo.push({ role: "tool", content: repeatFeedback(name, count) });
          stuck = true;
          continue;
        }
        if (name === "web_read") webReadNudged = true; // đã đọc rồi → khỏi nhắc
        if (dataFetchTools.has(name)) calledDataFetchTool = true; // G5: đã chạm dữ liệu thật
        if (name === LAAM_AUDIT_TOOL_NAME) calledAuditTool = true; // G5: đổi nội dung nhắc
        const callArgs = args;
        const result = await deps.dispatch(name, callArgs);
        toolCallCount++;
        // Empty result → tell the model (in the tool result) that emptiness is not absence.
        // Only the convo copy is annotated; `result` below stays raw for the view/drilldown.
        convo.push({ role: "tool", content: JSON.stringify(annotateEmptyResult(result, callArgs)) });
        // Panel per BIG result, emitted as it lands. A turn can run several queries (measured:
        // the two heaviest demo questions run five each), so one panel per turn would hide four
        // of them — and hiding them is exactly what makes reducing the model's copy unsafe.
        if (opts.onView && worthShowing(result)) {
          const view = deriveFromToolResult(name, result, Date.now(), queryTextFromArgs(callArgs));
          if (view) emitViewOnce(view);
        }
        if (name === "web_search" && searchResultHasUrl(result)) sawWebSearchWithUrl = true;
        // D2: tool liệt kê vừa chạy + câu hỏi nhắc đúng tên một mục trong kết quả →
        // CODE đi tiếp bước chi tiết (xem drilldown.ts). Một lần/lượt: nếu không, model
        // gọi lại tool liệt kê là lại kéo thêm một bản ghi chi tiết nữa.
        if (!drilledDown) {
          const pair = drilldownPairs.find((p) => p.listTool === name);
          const plan = pair && lastUserMessage ? planDrilldown(pair, result, lastUserMessage) : null;
          if (plan) {
            drilledDown = true;
            // Fail-soft: tool chi tiết hỏng thì lượt vẫn trả lời được bằng dữ liệu liệt kê
            // đã có (nếu để ném, cả lượt chết dù bước này chỉ là bước làm giàu thêm).
            // PendingWriteSignal KHÔNG bị nuốt: cặp drilldown cấu hình nhầm sang tool ghi
            // phải nổ ra ngoài để route suspend chờ xác nhận (Rule 12).
            try {
              const detail = await deps.dispatch(plan.name, plan.args);
              toolCallCount++;
              convo.push({ role: "assistant", content: "", tool_calls: [{ function: { name: plan.name, arguments: plan.args } }] });
              convo.push({ role: "tool", content: JSON.stringify(annotateEmptyResult(detail, plan.args)) });
              if (opts.onView && worthShowing(detail)) {
                const detailView = deriveFromToolResult(plan.name, detail, Date.now(), queryTextFromArgs(plan.args));
                if (detailView) emitViewOnce(detailView);
              }
            } catch (e) {
              if (e instanceof PendingWriteSignal) throw e;
              console.warn(`[drilldown] ${plan.name} lỗi — bỏ qua bước chi tiết`, e);
            }
          }
        }
      }
      if (sawWebSearchWithUrl && !webReadNudged) {
        convo.push({ role: "tool", content: WEB_READ_NUDGE });
        webReadNudged = true; // chỉ chèn 1 lần/lượt
      }
      // G5: CHỦ ĐỘNG kiểm tra ngay sau lượt CÓ gọi tool, không đợi model tự dừng. ĐO ĐƯỢC
      // (2026-08-05, CHAT_MAX_ROUNDS=8): đặt guard này ở nhánh "model không gọi tool nào" (bên
      // dưới) thì KHÔNG BAO GIỜ chạy nếu model cứ liên tục gọi tool đọc cấu trúc/liệt kê hết cả
      // 7/8 vòng — vòng cuối bị ép tools=[] TRƯỚC KHI model kịp "tự dừng" để guard đó đánh giá.
      // Kiểm tra ở đây (ngay sau khi dispatch xong tool của lượt) bắt được cả trường hợp đó:
      // hết roundsLeft mà chưa chạm tool dữ liệu → chèn nhắc NGAY, không chờ model tự nhận ra.
      const roundsLeft = maxRounds - 1 - i; // số vòng còn lại SAU vòng này (không tính vòng chót ép trả lời)
      // Ca "đã gọi laam_query_audit" KHÔNG cần chờ tới ngưỡng LEAD_ROUNDS như ca dò-cấu-trúc
      // chung — dò cấu trúc CÓ THỂ là bước hợp lệ đang đi tới dữ liệu thật (nên chờ thêm), còn
      // gọi laam_query_audit cho câu hỏi nghiệp vụ là SAI NGAY TỪ ĐẦU (không phải "cần thêm thời
      // gian", mà là "đi sai hướng") — nhắc CÀNG SỚM CÀNG TỐT để còn nhiều vòng phục hồi. ĐO
      // ĐƯỢC (2026-08-05, thread dài 12 câu liên tục): chờ tới LEAD_ROUNDS=3 như ca chung thì
      // đôi khi model đã dừng gọi tool và "chốt" kết luận sai trước khi kịp tới ngưỡng đó.
      const readyGeneric = !calledDataFetchTool && !dataFetchNudged && roundsLeft <= DATA_FETCH_NUDGE_LEAD_ROUNDS;
      // KHÔNG còn điều kiện `!calledDataFetchTool`: ĐO ĐƯỢC (2026-08-05, Larvis câu 12) model
      // gọi tool dữ liệu DAAB TRƯỚC rồi mới gọi laam_query_audit — điều kiện cũ tắt guard câm
      // đúng lúc lỗi xảy ra. Đọc nhật ký RIÊNG của LAAM để trả lời câu hỏi nghiệp vụ là sai bất
      // kể trước đó đã gọi tool gì. Latch RIÊNG (không dùng chung dataFetchNudged) để lời nhắc
      // chung đã bắn không nuốt mất lời nhắc này, và ngược lại.
      const readyAuditMisuse = calledAuditTool && !auditMisuseNudged;
      if (
        !stuck &&
        dataFetchTools.size > 0 &&
        (readyGeneric || readyAuditMisuse) &&
        roundsLeft >= 2 // < 2 thì round kế tiếp đã là vòng chót bị ép tools=[] — nhắc cũng vô ích
      ) {
        // Audit-misuse thắng khi cả hai cùng sẵn sàng: nó chỉ đích danh sai lầm cụ thể, còn lời
        // nhắc chung chỉ nói "hãy gọi tool dữ liệu" — yếu hơn hẳn với model đã tự thuyết phục
        // bằng audit log.
        if (readyAuditMisuse) {
          auditMisuseNudged = true;
          convo.push({ role: "tool", content: auditMisuseNudge(dataFetchTools) });
        } else {
          dataFetchNudged = true;
          convo.push({ role: "tool", content: DATA_FETCH_NUDGE });
        }
      }
      // Context mgmt: evict oldest raw tool bytes when the convo nears the model window
      // (provider-aware via budgetChars) so a long run never silently truncates.
      convo = evictOldToolResults(convo, { budgetChars, keepRecent }).convo;
      if (stuck) {
        opts.onBackstop?.("repeat");
        break;
      }
      continue;
    }
    if (!isLastRound && i === 0 && tools.length > 0 && !groundingNudged) {
      // G4: trả lời ngay ở vòng đầu mà chưa chạm dữ liệu nào → nhắc 1 lần rồi hỏi lại.
      // Latch giữ đúng MỘT lần/lượt: model không chịu gọi tool ở vòng 2 thì thoát bình
      // thường (giữ câu trả lời), không quay vòng tới backstop.
      groundingNudged = true;
      convo.push({ role: "tool", content: GROUNDING_NUDGE });
      continue;
    }
    // G5: lượt sắp kết thúc, model ĐÃ gọi tool nhưng chưa tool nào lấy dữ liệu thật (chỉ
    // đọc cấu trúc/liệt kê) → nhắc đúng 1 lần rồi hỏi lại. Đặt SAU G4 vì hai guard bù nhau:
    // G4 lo "không gọi tool nào", G5 lo "có gọi nhưng chưa chạm dữ liệu".
    //
    // ĐO ĐƯỢC (2026-08-05, CHAT_MAX_ROUNDS=8): với câu hỏi cần dò nhiều bảng, model tiêu hết
    // 6-7 vòng chỉ để describe_table TRƯỚC KHI G5 kịp nhắc — nhắc xong không còn vòng nào để
    // model vừa gọi tool dữ liệu VỪA tổng hợp câu trả lời (cần tối thiểu 2 vòng sau lượt nhắc:
    // 1 để gọi tool, 1 để trả lời), nên lượt bị đẩy thẳng vào backstop và trả lời "chưa có dữ
    // liệu" y hệt như không có G5. Chỉ nhắc khi CHẮC CHẮN còn đủ chỗ để lời nhắc có tác dụng
    // — nhắc mà không còn vòng để hành động thì thà im lặng, để hành vi giữ nguyên như trước.
    const roundsAfterNudge = maxRounds - 1 - i; // số vòng còn lại SAU vòng vừa nhắc
    if (
      !isLastRound &&
      toolCallCount > 0 &&
      dataFetchTools.size > 0 &&
      !calledDataFetchTool &&
      !dataFetchNudged &&
      // Giữ bất biến "tối đa MỘT lời nhắc G5 mỗi lượt" qua cả hai chỗ nhắc. Trước đây chỗ nhắc
      // trong-vòng đặt dataFetchNudged nên điều kiện trên đã đủ chặn; nay nó đặt latch RIÊNG
      // (auditMisuseNudged) nên phải kiểm cả latch đó, nếu không lượt đã bị nhắc audit sẽ bị
      // nhắc lại lần hai ở đây.
      !auditMisuseNudged &&
      roundsAfterNudge >= 2
    ) {
      if (calledAuditTool) {
        auditMisuseNudged = true;
        convo.push({ role: "tool", content: auditMisuseNudge(dataFetchTools) });
      } else {
        dataFetchNudged = true;
        convo.push({ role: "tool", content: DATA_FETCH_NUDGE });
      }
      continue;
    }
    if (isLastRound) opts.onBackstop?.("rounds"); // reached the backstop round → forced text → honest signal
    break;
  }
  // (The old tail picked ONE view here, gated on toolCallCount >= 2. Both are gone: the
  // "incidental lookup" problem that gate solved is now handled by worthShowing()'s size test
  // at the point each result lands, and the single-question-single-big-table case — the one
  // that most needs a panel — has exactly one tool call.)
  return convo;
}
