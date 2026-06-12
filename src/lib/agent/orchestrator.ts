// L0 — vòng tool-call (bounded, non-streaming). Chuyển từ /api/chat, đổi
// execute→dispatch. onEvent phát ở makeDispatch (chokepoint), không lặp ở đây.
import type { ConnectorTool } from "@/lib/connectors/types";

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

export async function runToolRounds(
  messages: ChatMessage[],
  tools: ConnectorTool[],
  deps: ToolRoundsDeps,
  maxRounds = 4,
): Promise<ChatMessage[]> {
  const convo: ChatMessage[] = messages.slice();
  let webReadNudged = convoHasWebRead(convo);
  for (let i = 0; i < maxRounds; i++) {
    const allowTools = i < maxRounds - 1; // vòng cuối phải ra text
    const res = await deps.callOllama(convo, allowTools ? tools : []);
    const msg = res?.message ?? {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (allowTools && calls.length) {
      convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      let sawWebSearchWithUrl = false;
      for (const tc of calls) {
        const name = tc.function?.name ?? "";
        if (name === "web_read") webReadNudged = true; // đã đọc rồi → khỏi nhắc
        const result = await deps.dispatch(name, tc.function?.arguments);
        convo.push({ role: "tool", content: JSON.stringify(result) });
        if (name === "web_search" && searchResultHasUrl(result)) sawWebSearchWithUrl = true;
      }
      if (sawWebSearchWithUrl && !webReadNudged) {
        convo.push({ role: "tool", content: WEB_READ_NUDGE });
        webReadNudged = true; // chỉ chèn 1 lần/lượt
      }
      continue;
    }
    break;
  }
  return convo;
}
