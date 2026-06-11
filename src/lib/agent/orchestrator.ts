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

export async function runToolRounds(
  messages: ChatMessage[],
  tools: ConnectorTool[],
  deps: ToolRoundsDeps,
  maxRounds = 4,
): Promise<ChatMessage[]> {
  const convo: ChatMessage[] = messages.slice();
  for (let i = 0; i < maxRounds; i++) {
    const allowTools = i < maxRounds - 1; // vòng cuối phải ra text
    const res = await deps.callOllama(convo, allowTools ? tools : []);
    const msg = res?.message ?? {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (allowTools && calls.length) {
      convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      for (const tc of calls) {
        const name = tc.function?.name ?? "";
        const result = await deps.dispatch(name, tc.function?.arguments);
        convo.push({ role: "tool", content: JSON.stringify(result) });
      }
      continue;
    }
    break;
  }
  return convo;
}
