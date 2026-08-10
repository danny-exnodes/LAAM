import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CEREBRAS_MODELS,
  CerebrasUnavailableError,
  cerebrasChat,
  cerebrasStream,
  isCerebrasModel,
} from "./cerebras";

// Adapter talks to Cerebras's OpenAI-compatible /v1/chat/completions via plain fetch (no
// SDK dep — mirrors byteplus.ts). Tests mock global.fetch and assert BOTH the outgoing
// OpenAI wire shape (translation of the Ollama-shaped convo) AND the inbound mapping back
// to the route's OllamaChatResponse contract.

const BASE = "https://api.cerebras.ai/v1";

// A non-streaming JSON response (one tool round / completion).
function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// A streaming SSE response whose body.getReader() replays the given chunks verbatim
// (mirrors byteplus.test.ts sseRes — lets us test partial-line reassembly).
function sseRes(chunks: string[], status = 200): Response {
  let i = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false as const, value: new TextEncoder().encode(chunks[i++]) }
            : { done: true as const, value: undefined },
      }),
    },
    text: async () => "",
  } as unknown as Response;
}

type Ev = { delta?: string; usage?: { in: number; out: number } };
async function collect(it: AsyncIterable<Ev>): Promise<Ev[]> {
  const out: Ev[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

let fetchMock: ReturnType<typeof vi.fn>;
function lastBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1)!;
  return JSON.parse((call[1] as RequestInit).body as string);
}

beforeEach(() => {
  vi.stubEnv("CEREBRAS_API_KEY", "csk-test-key");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // request() backs off before retrying a transient status. Every retry-exhausting case (the
  // 429/503/529 mappings below included) would otherwise pay that wait for real.
  vi.stubEnv("CEREBRAS_RETRY_DELAY_MS", "0");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isCerebrasModel — exact whitelist (no prefix routing → no Ollama collision)", () => {
  test("whitelisted ids pass; everything else fails", () => {
    expect(CEREBRAS_MODELS.length).toBeGreaterThan(0);
    for (const m of CEREBRAS_MODELS) expect(isCerebrasModel(m)).toBe(true);
    // a local Ollama deepseek tag must NOT be mistaken for a Cerebras model
    expect(isCerebrasModel("deepseek-r1:7b")).toBe(false);
    expect(isCerebrasModel("llama-3.3-70b")).toBe(false); // not whitelisted yet
    expect(isCerebrasModel("claude-opus-4-8")).toBe(false);
    expect(isCerebrasModel("gemma4:e4b")).toBe(false);
    expect(isCerebrasModel("")).toBe(false);
    // Cerebras and BytePlus serve the literal SAME model name ("gpt-oss-120b"); the bare
    // wire name must NOT itself be a valid Cerebras picker id, or configuring both
    // providers' keys would make isCerebrasModel/isBytePlusModel both claim the same turn.
    expect(isCerebrasModel("gpt-oss-120b")).toBe(false);
  });
});

describe("cerebrasChat — outgoing OpenAI request shape", () => {
  const model = CEREBRAS_MODELS[0];

  test("POSTs to {base}/chat/completions with Bearer auth and stream:false", async () => {
    fetchMock.mockResolvedValue(jsonRes({ choices: [{ message: { role: "assistant", content: "hi" } }] }));
    await cerebrasChat({ model, messages: [{ role: "user", content: "hi" }], tools: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/chat/completions`);
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer csk-test-key");
    expect(headers["content-type"]).toBe("application/json");
    expect(lastBody().stream).toBe(false);
    // The picker id carries a "-cerebras" suffix (collision guard vs. BytePlus, which
    // owns the bare "gpt-oss-120b" as ITS picker id) — the wire body must send the literal
    // model name Cerebras's API expects, not the picker id.
    expect(lastBody().model).toBe("gpt-oss-120b");
  });

  test("strips the LAAM-specific `kind` field from tool schemas before sending", async () => {
    fetchMock.mockResolvedValue(jsonRes({ choices: [{ message: { role: "assistant", content: "" } }] }));
    await cerebrasChat({
      model,
      messages: [{ role: "user", content: "x" }],
      tools: [
        { type: "function", kind: "read", function: { name: "laam_list_agents", description: "d", parameters: { type: "object" } } },
        { type: "function", kind: "write", function: { name: "demo_create_task", description: "d2", parameters: { type: "object" } } },
      ] as never,
    });
    const tools = lastBody().tools as Array<Record<string, unknown>>;
    expect(tools).toEqual([
      { type: "function", function: { name: "laam_list_agents", description: "d", parameters: { type: "object" } } },
      { type: "function", function: { name: "demo_create_task", description: "d2", parameters: { type: "object" } } },
    ]);
    for (const t of tools) expect(t).not.toHaveProperty("kind");
  });

  test("omits the tools field entirely when no tools (final round must produce text)", async () => {
    fetchMock.mockResolvedValue(jsonRes({ choices: [{ message: { role: "assistant", content: "done" } }] }));
    await cerebrasChat({ model, messages: [{ role: "user", content: "x" }], tools: [] });
    expect(lastBody()).not.toHaveProperty("tools");
  });

  test("passes sampling options (temperature/top_p/presence_penalty) when provided", async () => {
    fetchMock.mockResolvedValue(jsonRes({ choices: [{ message: { role: "assistant", content: "x" } }] }));
    await cerebrasChat({
      model,
      messages: [{ role: "user", content: "x" }],
      tools: [],
      options: { temperature: 0.3, top_p: 0.9, presence_penalty: 0.2 },
    });
    const b = lastBody();
    expect(b.temperature).toBe(0.3);
    expect(b.top_p).toBe(0.9);
    expect(b.presence_penalty).toBe(0.2);
  });
});

describe("cerebrasChat — convo translation (Ollama-shaped → OpenAI), like byteplus's toOpenAI", () => {
  const model = CEREBRAS_MODELS[0];
  beforeEach(() =>
    fetchMock.mockResolvedValue(jsonRes({ choices: [{ message: { role: "assistant", content: "ok" } }] })),
  );

  test("system/user/assistant pass through with correct roles", async () => {
    await cerebrasChat({
      model,
      tools: [],
      messages: [
        { role: "system", content: "SYS" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "more" },
      ],
    });
    expect(lastBody().messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "more" },
    ]);
  });

  test("assistant tool_calls get synthesized ids + stringified args; following tool msg gets matching tool_call_id", async () => {
    await cerebrasChat({
      model,
      tools: [],
      messages: [
        { role: "user", content: "tạo task" },
        // Ollama-shaped: arguments is an OBJECT, no id
        { role: "assistant", content: "", tool_calls: [{ function: { name: "demo_create_task", arguments: { title: "X" } } }] },
        { role: "tool", content: '{"id":"t1"}' },
      ],
    });
    const msgs = lastBody().messages as Array<Record<string, unknown>>;
    expect(msgs[0]).toEqual({ role: "user", content: "tạo task" });
    // assistant with OpenAI tool_calls shape
    const asst = msgs[1] as { role: string; content: string | null; tool_calls: Array<Record<string, unknown>> };
    expect(asst.role).toBe("assistant");
    expect(asst.tool_calls).toHaveLength(1);
    const tc = asst.tool_calls[0] as { id: string; type: string; function: { name: string; arguments: string } };
    expect(tc.type).toBe("function");
    expect(tc.function.name).toBe("demo_create_task");
    expect(tc.function.arguments).toBe('{"title":"X"}'); // STRINGIFIED for OpenAI
    expect(typeof tc.id).toBe("string");
    expect(tc.id.length).toBeGreaterThan(0);
    // tool result paired by id
    expect(msgs[2]).toEqual({ role: "tool", tool_call_id: tc.id, content: '{"id":"t1"}' });
  });

  test("orphan tool message (web_read nudge, no preceding tool_call) → converted to user (OpenAI rejects unpaired tool msgs)", async () => {
    await cerebrasChat({
      model,
      tools: [],
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: "", tool_calls: [{ function: { name: "web_search", arguments: { q: "x" } } }] },
        { role: "tool", content: '{"results":[{"url":"http://a"}]}' },
        // the nudge — an extra tool message with NO matching call
        { role: "tool", content: "Bạn có thể gọi web_read..." },
      ],
    });
    const msgs = lastBody().messages as Array<{ role: string; content: string; tool_call_id?: string }>;
    // first tool message paired; the orphan nudge demoted to user
    const toolMsgs = msgs.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0].tool_call_id).toBeTruthy();
    const nudge = msgs.find((m) => typeof m.content === "string" && m.content.startsWith("Bạn có thể gọi web_read"));
    expect(nudge!.role).toBe("user");
  });

  test("images are ignored (v1 = no vision)", async () => {
    await cerebrasChat({
      model,
      tools: [],
      messages: [{ role: "user", content: "ảnh?", images: ["QUJD"] }],
    });
    expect(JSON.stringify(lastBody())).not.toContain("QUJD");
  });
});

describe("cerebrasChat — inbound mapping → OllamaChatResponse (Rule 13: trust code, not LLM args)", () => {
  const model = CEREBRAS_MODELS[0];

  test("OpenAI tool_calls.arguments arrives as a JSON STRING → mapped to an OBJECT for the dispatch pipeline", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              // OpenAI returns arguments as a STRING — a naive echo would feed the
              // dispatch a string where the Ollama pipeline expects an object.
              tool_calls: [{ id: "call_x", type: "function", function: { name: "demo_create_task", arguments: '{"title":"  spaced  ","n":2}' } }],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    );
    const res = await cerebrasChat({ model, tools: [], messages: [{ role: "user", content: "go" }] });
    const calls = res.message!.tool_calls as Array<{ function: { name: string; arguments: unknown } }>;
    expect(calls[0].function.name).toBe("demo_create_task");
    expect(calls[0].function.arguments).toEqual({ title: "  spaced  ", n: 2 }); // OBJECT, parsed
  });

  test("malformed JSON args string → {} (mirrors makeDispatch/parseArgs, no crash)", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "c", type: "function", function: { name: "x", arguments: "{not json" } }] } }],
      }),
    );
    const res = await cerebrasChat({ model, tools: [], messages: [{ role: "user", content: "go" }] });
    const calls = res.message!.tool_calls as Array<{ function: { arguments: unknown } }>;
    expect(calls[0].function.arguments).toEqual({});
  });

  test("plain text completion (no tool_calls) → message without tool_calls", async () => {
    fetchMock.mockResolvedValue(jsonRes({ choices: [{ message: { role: "assistant", content: "câu trả lời" } }] }));
    const res = await cerebrasChat({ model, tools: [], messages: [{ role: "user", content: "hi" }] });
    expect(res.message!.content).toBe("câu trả lời");
    expect(res.message!.tool_calls ?? []).toEqual([]);
  });

  // Fail loud (Rule 12): a content-filter / refusal can return an EMPTY choices[].
  // Mapping that to empty content silently breaks the tool-loop (no tool_calls → loop
  // ends → empty turn, user pays for nothing). Throw instead — a plain Error so the route
  // surfaces 'api' (not a benign 'unavailable').
  test("empty choices[] → throws a plain Error (no silent zombie round)", async () => {
    fetchMock.mockResolvedValue(jsonRes({ choices: [] }));
    const err = await cerebrasChat({ model, tools: [], messages: [{ role: "user", content: "x" }] }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CerebrasUnavailableError);
  });
});

describe("cerebrasChat — auth + error mapping (typed, like BytePlusUnavailableError)", () => {
  const model = CEREBRAS_MODELS[0];

  test("no CEREBRAS_API_KEY → CerebrasUnavailableError('auth') BEFORE any fetch", async () => {
    vi.stubEnv("CEREBRAS_API_KEY", "");
    await expect(cerebrasChat({ model, tools: [], messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({
      name: "CerebrasUnavailableError",
      code: "auth",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const httpCases: [number, string][] = [
    [401, "auth"],
    [403, "auth"],
    [429, "rate_limit"],
    [503, "overloaded"],
    [529, "overloaded"],
  ];
  for (const [status, code] of httpCases) {
    test(`HTTP ${status} → CerebrasUnavailableError('${code}')`, async () => {
      fetchMock.mockResolvedValue(jsonRes({ error: { message: "boom" } }, status));
      await expect(cerebrasChat({ model, tools: [], messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({
        name: "CerebrasUnavailableError",
        code,
      });
    });
  }

  test("network error (fetch rejects) → CerebrasUnavailableError('connection')", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    await expect(cerebrasChat({ model, tools: [], messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({
      name: "CerebrasUnavailableError",
      code: "connection",
    });
  });

  test("unexpected HTTP (e.g. 400 schema) → plain Error (route surfaces as 'api'), NOT swallowed as unavailable", async () => {
    fetchMock.mockResolvedValue(jsonRes({ error: { message: "bad schema" } }, 400));
    const err = await cerebrasChat({ model, tools: [], messages: [{ role: "user", content: "x" }] }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CerebrasUnavailableError);
  });
});

describe("cerebrasStream — final streaming completion (SSE)", () => {
  const model = CEREBRAS_MODELS[0];

  test("requests stream:true + include_usage, NO tools", async () => {
    fetchMock.mockResolvedValue(sseRes(["data: [DONE]\n\n"]));
    await collect(cerebrasStream({ model, messages: [{ role: "user", content: "hi" }] }));
    const b = lastBody();
    expect(b.stream).toBe(true);
    expect(b.stream_options).toEqual({ include_usage: true });
    expect(b).not.toHaveProperty("tools");
  });

  test("yields each content delta VERBATIM (Rule 13 — odd spacing preserved) then usage from the final chunk", async () => {
    fetchMock.mockResolvedValue(
      sseRes([
        'data: {"choices":[{"delta":{"content":"  Xin   chào\\n\\n"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"\\t— 42  "}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":123,"completion_tokens":45}}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const got = await collect(cerebrasStream({ model, messages: [{ role: "user", content: "hi" }] }));
    expect(got).toEqual([
      { delta: "  Xin   chào\n\n" },
      { delta: "\t— 42  " },
      { usage: { in: 123, out: 45 } },
    ]);
  });

  // No fake billing: when Cerebras sends NO final usage chunk, the adapter must NOT
  // fabricate a 0/0 usage event — otherwise the route's gotUsage flips true and
  // persists/emits a fake $0 token frame on a BILLED provider. Omit it so the route's
  // emitTokens=gotUsage correctly drops the token frame (BytePlus/Claude-style).
  test("omits the usage event entirely when no final usage chunk arrives (no fake 0/0)", async () => {
    fetchMock.mockResolvedValue(sseRes(['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', "data: [DONE]\n\n"]));
    const got = await collect(cerebrasStream({ model, messages: [{ role: "user", content: "x" }] }));
    expect(got).toEqual([{ delta: "hi" }]); // delta only — no trailing usage
  });

  test("reassembles an SSE event split across read() chunks", async () => {
    const evt = 'data: {"choices":[{"delta":{"content":"x"}}]}\n\n';
    fetchMock.mockResolvedValue(sseRes([evt.slice(0, 12), evt.slice(12), "data: [DONE]\n\n"]));
    const got = await collect(cerebrasStream({ model, messages: [{ role: "user", content: "hi" }] }));
    expect(got.filter((e) => e.delta).map((e) => e.delta)).toEqual(["x"]);
  });

  test("no CEREBRAS_API_KEY → CerebrasUnavailableError('auth') before fetch", async () => {
    vi.stubEnv("CEREBRAS_API_KEY", "");
    await expect(collect(cerebrasStream({ model, messages: [{ role: "user", content: "x" }] }))).rejects.toMatchObject({
      code: "auth",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("non-ok status before any delta → typed error (429 → rate_limit)", async () => {
    fetchMock.mockResolvedValue(sseRes([], 429));
    await expect(collect(cerebrasStream({ model, messages: [{ role: "user", content: "x" }] }))).rejects.toMatchObject({
      code: "rate_limit",
    });
  });

  test("forwards AbortSignal to fetch", async () => {
    fetchMock.mockResolvedValue(sseRes(["data: [DONE]\n\n"]));
    const ctrl = new AbortController();
    await collect(cerebrasStream({ model, messages: [{ role: "user", content: "x" }], signal: ctrl.signal }));
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(ctrl.signal);
  });

  test("respects CEREBRAS_BASE_URL override", async () => {
    vi.stubEnv("CEREBRAS_BASE_URL", "https://api.cerebras.ai/v1-staging");
    fetchMock.mockResolvedValue(sseRes(["data: [DONE]\n\n"]));
    await collect(cerebrasStream({ model, messages: [{ role: "user", content: "x" }] }));
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.cerebras.ai/v1-staging/chat/completions");
  });
});

// Cerebras may answer 429/503/529 for its own capacity, not only a per-key quota. Losing a
// whole turn to a blip is expensive: the tool rounds already ran and only the final
// generation failed. One retry, and ONLY for the transient statuses.
describe("transient-failure retry", () => {
  const model = CEREBRAS_MODELS[0];
  const ask = () => cerebrasChat({ model, tools: [], messages: [{ role: "user", content: "x" }] });
  const ok = { choices: [{ message: { role: "assistant", content: "hi" } }] };

  for (const status of [429, 503, 529]) {
    test(`HTTP ${status} then success → one retry, answer returned instead of a dead turn`, async () => {
      fetchMock
        .mockResolvedValueOnce(jsonRes({ error: { message: "overloaded" } }, status))
        .mockResolvedValueOnce(jsonRes(ok));
      await expect(ask()).resolves.toMatchObject({ message: { content: "hi" } });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  }

  // Bounded: retrying harder into an overloaded server makes it worse, and the user is waiting.
  test("still failing after the retry → the typed error surfaces, exactly 2 attempts", async () => {
    fetchMock.mockResolvedValue(jsonRes({ error: { message: "overloaded" } }, 429));
    await expect(ask()).rejects.toMatchObject({ name: "CerebrasUnavailableError", code: "rate_limit" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // A bad key is not transient — retrying burns the user's time to fail identically.
  for (const status of [401, 403]) {
    test(`HTTP ${status} is not retried — one attempt only`, async () => {
      fetchMock.mockResolvedValue(jsonRes({ error: { message: "nope" } }, status));
      await expect(ask()).rejects.toMatchObject({ code: "auth" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }

  test("network reject is not retried — waiting carries no signal that it would help", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(ask()).rejects.toMatchObject({ code: "connection" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // INTENT: retrying a stream that already emitted tokens would replay the answer. request()
  // hands back the Response before any body is read, so the retry can only ever happen before
  // the first byte — this asserts the streaming caller gets the same protection.
  test("stream: 429 before any delta retries and then streams normally", async () => {
    fetchMock
      .mockResolvedValueOnce(sseRes([], 429))
      .mockResolvedValueOnce(sseRes(['data: {"choices":[{"delta":{"content":"xin chào"}}]}\n\n', "data: [DONE]\n\n"]));
    const got = await collect(cerebrasStream({ model, messages: [{ role: "user", content: "x" }] }));
    expect(got).toEqual([{ delta: "xin chào" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
