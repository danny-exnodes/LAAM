import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock @anthropic-ai/sdk theo ĐÚNG shape 0.104.x: error classes là NAMED export
// (không phải static trên default; 529 overloaded = InternalServerError có
// status/type — không có lớp OverloadedError riêng); messages.stream điều khiển
// được per-test.
const h = vi.hoisted(() => ({
  streamImpl: null as null | ((params: unknown) => unknown),
  streamCalls: [] as Record<string, unknown>[],
}));

vi.mock("@anthropic-ai/sdk", () => {
  // Constructor signature khớp SDK thật: (status, error, message, headers, type?).
  class APIError extends Error {
    status?: number;
    error?: unknown;
    type?: string | null;
    constructor(status?: number, error?: unknown, message?: string, _headers?: unknown, type?: string | null) {
      super(message ?? String(status));
      this.status = status;
      this.error = error;
      this.type = type ?? null;
    }
  }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class InternalServerError extends APIError {}
  class APIConnectionError extends APIError {
    constructor({ message }: { message?: string; cause?: Error } = {}) {
      super(undefined, undefined, message ?? "Connection error.", undefined, null);
    }
  }
  class MockAnthropic {
    messages = {
      stream: (params: Record<string, unknown>) => {
        h.streamCalls.push(params);
        if (!h.streamImpl) throw new Error("test: no streamImpl configured");
        return h.streamImpl(params);
      },
    };
  }
  return {
    default: MockAnthropic,
    APIError,
    AuthenticationError,
    RateLimitError,
    InternalServerError,
    APIConnectionError,
  };
});

import {
  APIConnectionError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { CLAUDE_MODELS, ClaudeUnavailableError, claudeStream, isClaudeModel } from "./claude";

// SDK MessageStream giả: async-iterable các stream event + finalMessage().
function sdkStream(events: unknown[], final: unknown = { usage: { input_tokens: 0, output_tokens: 0 } }) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
    finalMessage: async () => final,
  };
}

const textDelta = (text: string) => ({ type: "content_block_delta", delta: { type: "text_delta", text } });

async function collect(it: AsyncIterable<{ delta?: string; usage?: { in: number; out: number } }>) {
  const out: { delta?: string; usage?: { in: number; out: number } }[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  h.streamImpl = null;
  h.streamCalls.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isClaudeModel — whitelist NGHIÊM (chỉ Sonnet 4.6 + Opus 4.8)", () => {
  test("sonnet/opus trong whitelist pass", () => {
    expect(isClaudeModel("claude-sonnet-4-6")).toBe(true);
    expect(isClaudeModel("claude-opus-4-8")).toBe(true);
    expect(CLAUDE_MODELS).toEqual(["claude-sonnet-4-6", "claude-opus-4-8"]);
  });
  test("model claude khác (haiku, sonnet cũ, suffix lạ) → fail — không silent fallback", () => {
    expect(isClaudeModel("claude-haiku-4-5")).toBe(false);
    expect(isClaudeModel("claude-sonnet-4-5")).toBe(false);
    expect(isClaudeModel("claude-sonnet-4-6-20251114")).toBe(false);
    expect(isClaudeModel("claude")).toBe(false);
    expect(isClaudeModel("gemma4:e4b")).toBe(false);
    expect(isClaudeModel("")).toBe(false);
  });
});

describe("claudeStream — dịch ChatMessage[] sang Messages API", () => {
  test("gập 2 system message ĐẦU (persona + summary SP-3) vào 1 param system; user/assistant pass-through dạng text block", async () => {
    h.streamImpl = () => sdkStream([textDelta("ok")], { usage: { input_tokens: 5, output_tokens: 1 } });
    await collect(
      claudeStream({
        model: "claude-sonnet-4-6",
        messages: [
          { role: "system", content: "PERSONA" },
          { role: "system", content: "Bối cảnh hội thoại trước (tóm tắt): X" },
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
          { role: "user", content: "tiếp đi" },
        ],
      }),
    );
    expect(h.streamCalls).toHaveLength(1);
    const params = h.streamCalls[0];
    expect(params.system).toBe("PERSONA\n\nBối cảnh hội thoại trước (tóm tắt): X");
    expect(params.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
      { role: "user", content: [{ type: "text", text: "tiếp đi" }] },
    ]);
  });

  test("options = max_tokens DUY NHẤT (16000) — không temperature/top_p/num_ctx", async () => {
    h.streamImpl = () => sdkStream([]);
    await collect(claudeStream({ model: "claude-opus-4-8", messages: [{ role: "user", content: "hi" }] }));
    const params = h.streamCalls[0];
    expect(params.model).toBe("claude-opus-4-8");
    expect(params.max_tokens).toBe(16000);
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("top_p");
    expect(params).not.toHaveProperty("options");
  });

  test("bỏ qua field images (MVS không vision) — không image block nào sinh ra", async () => {
    h.streamImpl = () => sdkStream([]);
    await collect(
      claudeStream({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "ảnh này là gì?", images: ["QUJD"] }],
      }),
    );
    expect(JSON.stringify(h.streamCalls[0])).not.toContain("QUJD");
    expect(h.streamCalls[0].messages).toEqual([
      { role: "user", content: [{ type: "text", text: "ảnh này là gì?" }] },
    ]);
  });

  test("resume (confirm): role tool → user text; assistant stub rỗng (tool_calls) bị bỏ — không prefill assistant cuối", async () => {
    h.streamImpl = () => sdkStream([]);
    await collect(
      claudeStream({
        model: "claude-sonnet-4-6",
        messages: [
          { role: "system", content: "SYS" },
          { role: "user", content: "tạo card" },
          { role: "assistant", content: "", tool_calls: [{ function: { name: "trello_create_card", arguments: {} } }] },
          { role: "tool", content: '{"card":{"id":"c9"}}' },
        ],
      }),
    );
    expect(h.streamCalls[0].messages).toEqual([
      { role: "user", content: [{ type: "text", text: "tạo card" }] },
      { role: "user", content: [{ type: "text", text: '{"card":{"id":"c9"}}' }] },
    ]);
  });

  // Rule 13: KHÔNG tin LLM/transport reproduce text — mock trả delta với spacing/ký tự
  // lạ, adapter phải pass-through NGUYÊN VĂN từng delta, đúng thứ tự, không trim/gộp.
  test("yield delta NGUYÊN VĂN (spacing lạ giữ nguyên) rồi usage cuối từ finalMessage", async () => {
    const weird = ["  Xin   chào\n\n", "\t— kết quả:  ", " 42  "];
    h.streamImpl = () => sdkStream(weird.map(textDelta), { usage: { input_tokens: 123, output_tokens: 45 } });
    const got = await collect(
      claudeStream({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] }),
    );
    expect(got).toEqual([
      { delta: "  Xin   chào\n\n" },
      { delta: "\t— kết quả:  " },
      { delta: " 42  " },
      { usage: { in: 123, out: 45 } },
    ]);
  });

  test("event không phải text_delta (vd input_json_delta / message_delta) bị bỏ qua", async () => {
    h.streamImpl = () =>
      sdkStream(
        [
          { type: "message_start", message: {} },
          textDelta("a"),
          { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{" } },
          { type: "message_stop" },
        ],
        { usage: { input_tokens: 1, output_tokens: 1 } },
      );
    const got = await collect(
      claudeStream({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] }),
    );
    expect(got).toEqual([{ delta: "a" }, { usage: { in: 1, out: 1 } }]);
  });
});

describe("claudeStream — error mapping có kiểu (ClaudeUnavailableError)", () => {
  const cases: [string, () => Error, "auth" | "rate_limit" | "overloaded" | "connection"][] = [
    ["AuthenticationError (401)", () => new AuthenticationError(401, undefined, "invalid x-api-key", new Headers()), "auth"],
    ["RateLimitError (429)", () => new RateLimitError(429, undefined, "rate limited", new Headers()), "rate_limit"],
    // SDK 0.104.x: 529 overloaded_error tới dưới dạng InternalServerError(status 529).
    [
      "InternalServerError 529 overloaded",
      () => new InternalServerError(529, undefined, "overloaded", new Headers(), "overloaded_error"),
      "overloaded",
    ],
    ["APIConnectionError", () => new APIConnectionError({ message: "Connection error." }), "connection"],
  ];
  for (const [label, makeErr, code] of cases) {
    test(`SDK ném ${label} → ClaudeUnavailableError code='${code}'`, async () => {
      h.streamImpl = () => {
        throw makeErr();
      };
      const it = claudeStream({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] });
      await expect(collect(it)).rejects.toMatchObject({ name: "ClaudeUnavailableError", code });
    });
  }

  test("lỗi KHÔNG thuộc 4 loại (vd BadRequest / 500 thường) → ném nguyên trạng, không nuốt", async () => {
    h.streamImpl = () => {
      throw new TypeError("schema sai");
    };
    const it = claudeStream({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] });
    await expect(collect(it)).rejects.toThrow(TypeError);
    // 500 api_error (không phải 529 overloaded) cũng KHÔNG bị map mù thành unavailable.
    h.streamImpl = () => {
      throw new InternalServerError(500, undefined, "api_error", new Headers(), "api_error");
    };
    const it2 = claudeStream({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] });
    await expect(collect(it2)).rejects.toBeInstanceOf(InternalServerError);
  });

  test("không có ANTHROPIC_API_KEY → ClaudeUnavailableError('auth') TRƯỚC khi gọi SDK", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const it = claudeStream({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] });
    await expect(collect(it)).rejects.toMatchObject({ name: "ClaudeUnavailableError", code: "auth" });
    expect(h.streamCalls).toHaveLength(0);
  });

  test("lỗi GIỮA stream (sau vài delta) cũng map đúng code", async () => {
    h.streamImpl = () => ({
      async *[Symbol.asyncIterator]() {
        yield textDelta("đầu ");
        throw new InternalServerError(529, undefined, "overloaded", new Headers(), "overloaded_error");
      },
      finalMessage: async () => ({ usage: { input_tokens: 0, output_tokens: 0 } }),
    });
    const got: unknown[] = [];
    const it = claudeStream({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] });
    let caught: unknown = null;
    try {
      for await (const ev of it) got.push(ev);
    } catch (e) {
      caught = e;
    }
    expect(got).toEqual([{ delta: "đầu " }]);
    expect(caught).toBeInstanceOf(ClaudeUnavailableError);
    expect((caught as ClaudeUnavailableError).code).toBe("overloaded");
  });
});
