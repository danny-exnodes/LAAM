// L0 — vòng tool-call (run-until-done, non-streaming). Chuyển từ /api/chat, đổi
// execute→dispatch. onEvent phát ở makeDispatch (chokepoint), không lặp ở đây.
import type { ConnectorTool } from "@/lib/connectors/types";
import { evictOldToolResults } from "./loop-context";

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
  convo.push({ role: "tool", content: JSON.stringify(result) });
}

// Runaway BACKSTOP on tool rounds — NOT a task-shaping cap. The loop's real exit is
// natural completion (model returns no tool calls). 25 matches LangGraph's
// recursion_limit default: high enough that legitimate multi-step tasks ("summarize 10
// emails then send") finish on their own, low enough to halt a runaway. The route can
// override via CHAT_MAX_ROUNDS; clamped so it can't be set absurdly high.
export const DEFAULT_MAX_ROUNDS = 25;
const MAX_ROUNDS_CEILING = 50; // hard safety ceiling — env CHAT_MAX_ROUNDS can raise the default up to here
const REPEAT_THRESHOLD = 3; // same tool+args this many times → stuck → stop, answer with what we have
// Default in-loop eviction budget — sized for the local 16k model (≈ route's
// REPLAY_BUDGET_CHARS). The route passes a much larger budget for big-context providers.
const DEFAULT_TOOL_BUDGET_CHARS = 37_000;

export type ToolRoundsOpts = {
  maxRounds?: number;
  budgetChars?: number; // evict oldest tool results when the convo exceeds this
  keepRecent?: number; // tool results kept verbatim during eviction (default 3)
  onBackstop?: () => void; // fired when the loop is FORCE-terminated (backstop / repeat), not on natural completion
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
  const seen = new Map<string, number>(); // repeat-detection: tool+args → count

  for (let i = 0; i < maxRounds; i++) {
    const isLastRound = i === maxRounds - 1; // ONLY the backstop forces a text answer
    const res = await deps.callOllama(convo, isLastRound ? [] : tools);
    const msg = res?.message ?? {};
    const calls = isLastRound ? [] : Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (calls.length) {
      convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      let sawWebSearchWithUrl = false;
      let stuck = false;
      for (const tc of calls) {
        const name = tc.function?.name ?? "";
        const args = tc.function?.arguments;
        const count = (seen.get(name + "|" + stableArgs(args)) ?? 0) + 1;
        seen.set(name + "|" + stableArgs(args), count);
        if (count >= REPEAT_THRESHOLD) {
          // Stuck on the same call — don't re-dispatch (result won't change); tell the
          // model, then end the loop gracefully so it answers with what it has.
          convo.push({ role: "tool", content: repeatFeedback(name, count) });
          stuck = true;
          continue;
        }
        if (name === "web_read") webReadNudged = true; // đã đọc rồi → khỏi nhắc
        const result = await deps.dispatch(name, args);
        convo.push({ role: "tool", content: JSON.stringify(result) });
        if (name === "web_search" && searchResultHasUrl(result)) sawWebSearchWithUrl = true;
      }
      if (sawWebSearchWithUrl && !webReadNudged) {
        convo.push({ role: "tool", content: WEB_READ_NUDGE });
        webReadNudged = true; // chỉ chèn 1 lần/lượt
      }
      // Context mgmt: evict oldest raw tool bytes when the convo nears the model window
      // (provider-aware via budgetChars) so a long run never silently truncates.
      convo = evictOldToolResults(convo, { budgetChars, keepRecent }).convo;
      if (stuck) {
        opts.onBackstop?.();
        break;
      }
      continue;
    }
    if (isLastRound) opts.onBackstop?.(); // reached the backstop round → forced text → honest signal
    break;
  }
  return convo;
}
