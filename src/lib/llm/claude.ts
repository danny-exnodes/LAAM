// C1 — Claude provider MVS: adapter mỏng trên @anthropic-ai/sdk cho /api/chat.
// Chat + stream ONLY (không tools/vision, không workflows — PIN). Route compose
// messages y như đường Ollama (persona + summary SP-3 + history + user) rồi gọi
// claudeStream; adapter dịch sang Messages API và yield delta text NGUYÊN VĂN
// (Rule 13 — không trim/gộp) + usage cuối để route phát frame {t:"tokens"}.
import Anthropic, {
  APIConnectionError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type { ChatMessage } from "@/lib/agent/orchestrator";

// Whitelist NGHIÊM theo yêu cầu user: CHỈ Sonnet 4.6 + Opus 4.8. Model bắt đầu
// "claude" ngoài danh sách này → route trả 400 (không silent fallback).
export const CLAUDE_MODELS = ["claude-sonnet-4-6", "claude-opus-4-8"] as const;

export function isClaudeModel(m: string): boolean {
  return (CLAUDE_MODELS as readonly string[]).includes(m);
}

export type ClaudeErrorCode = "auth" | "rate_limit" | "overloaded" | "connection";

// Lỗi "Claude không sẵn sàng" có kiểu — route map `code` sang notice 3 thứ tiếng
// (pattern TOOL_LOOP_ERR). Lỗi khác (vd 400 schema) ném nguyên trạng — fail loud.
export class ClaudeUnavailableError extends Error {
  code: ClaudeErrorCode;
  constructor(code: ClaudeErrorCode, message?: string) {
    super(message ?? `Claude unavailable: ${code}`);
    this.name = "ClaudeUnavailableError";
    this.code = code;
  }
}

// MVS: max_tokens là option DUY NHẤT gửi đi (không temperature/top_p — các model
// Opus 4.7+ còn 400 khi nhận sampling params; num_ctx là khái niệm Ollama).
const CLAUDE_MAX_TOKENS = 16000;

function mapClaudeError(e: unknown): unknown {
  if (e instanceof AuthenticationError) return new ClaudeUnavailableError("auth", e.message);
  if (e instanceof RateLimitError) return new ClaudeUnavailableError("rate_limit", e.message);
  // SDK 0.104.x không có lớp OverloadedError riêng: 529 (`overloaded_error`) tới
  // dưới dạng InternalServerError (status >= 500) — phân biệt bằng status/type.
  if (e instanceof InternalServerError && (e.status === 529 || e.type === "overloaded_error")) {
    return new ClaudeUnavailableError("overloaded", e.message);
  }
  if (e instanceof APIConnectionError) return new ClaudeUnavailableError("connection", e.message);
  return e;
}

// Dịch ChatMessage[] nội bộ → (system, messages) Messages API:
// - Các message role:"system" ĐẦU (persona + summary SP-3 — có thể là HAI) gập
//   vào 1 param `system` top-level (Messages API không nhận system trong messages).
// - Còn lại: assistant giữ assistant; mọi role khác (user, và "tool" trên đường
//   confirm-resume — kết quả write đã thực thi) thành user text để Claude tường
//   thuật. Content rỗng bị bỏ (stub assistant tool_calls; Messages API từ chối
//   text block rỗng, và assistant cuối = prefill → 400 trên Sonnet/Opus 4.6+).
// - `images` bị bỏ qua (MVS không vision).
function toAnthropic(msgs: ChatMessage[]): { system: string; messages: Anthropic.MessageParam[] } {
  let i = 0;
  const sys: string[] = [];
  while (i < msgs.length && msgs[i].role === "system") {
    sys.push(msgs[i].content);
    i++;
  }
  const messages: Anthropic.MessageParam[] = [];
  for (const m of msgs.slice(i)) {
    const text = m.content ?? "";
    if (!text.trim()) continue;
    messages.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ type: "text", text }],
    });
  }
  return { system: sys.join("\n\n"), messages };
}

// Stream 1 completion từ Claude. Yield {delta} cho từng text_delta (verbatim),
// rồi {usage} cuối từ final message (input_tokens/output_tokens). Client init
// lazy từ env mỗi lần gọi — không có key ⇒ ClaudeUnavailableError('auth') TRƯỚC
// khi chạm SDK/network.
export async function* claudeStream(opts: {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): AsyncGenerator<{ delta?: string; usage?: { in: number; out: number } }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ClaudeUnavailableError("auth", "ANTHROPIC_API_KEY chưa được đặt");
  const client = new Anthropic({ apiKey: key });
  const { system, messages } = toAnthropic(opts.messages);
  try {
    const stream = client.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? CLAUDE_MAX_TOKENS,
      ...(system ? { system } : {}),
      messages,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { delta: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    yield { usage: { in: final.usage.input_tokens, out: final.usage.output_tokens } };
  } catch (e) {
    throw mapClaudeError(e);
  }
}
