import { describe, expect, test, vi } from "vitest";
import { INTERNAL_TOOLS, modelToolSchemas } from "@/lib/agent/registry";

// We only exercise the pure buildOllamaPayload helper here, but importing the
// route module pulls in @/auth (next-auth) and @/db — stub both so the module
// loads under vitest.
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/db", () => ({ db: {} }));

import { buildOllamaPayload, isConfirmBody } from "./route";

const defaults = { model: "gemma4:e4b", system: "DEFAULT SYS" };
const history = [
  { role: "user", content: "hi" },
  { role: "assistant", content: "hello" },
];

describe("buildOllamaPayload", () => {
  test("applies defaults when model/system/opts omitted", () => {
    const p = buildOllamaPayload({}, history, defaults);
    expect(p.model).toBe("gemma4:e4b");
    expect(p.stream).toBe(true);
    // system prepended, then history
    expect(p.messages[0]).toEqual({ role: "system", content: "DEFAULT SYS" });
    expect(p.messages.slice(1)).toEqual(history);
    // no temperature/top_p provided → options has neither key
    expect(p.options).not.toHaveProperty("temperature");
    expect(p.options).not.toHaveProperty("top_p");
  });

  test("passes through model and system overrides", () => {
    const p = buildOllamaPayload(
      { model: "qwen3-vl:8b", system: "CUSTOM" },
      history,
      defaults,
    );
    expect(p.model).toBe("qwen3-vl:8b");
    expect(p.messages[0]).toEqual({ role: "system", content: "CUSTOM" });
  });

  test("maps temperature and topP into options.temperature/top_p", () => {
    const p = buildOllamaPayload(
      { temperature: 0.2, topP: 0.5 },
      history,
      defaults,
    );
    expect(p.options.temperature).toBe(0.2);
    expect(p.options.top_p).toBe(0.5);
  });

  test("ignores empty-string model/system (falls back to defaults)", () => {
    const p = buildOllamaPayload({ model: "  ", system: "  " }, history, defaults);
    expect(p.model).toBe("gemma4:e4b");
    expect(p.messages[0]).toEqual({ role: "system", content: "DEFAULT SYS" });
  });

  test("ignores non-number temperature/topP", () => {
    const p = buildOllamaPayload(
      { temperature: "hot" as unknown as number, topP: NaN },
      history,
      defaults,
    );
    expect(p.options).not.toHaveProperty("temperature");
    expect(p.options).not.toHaveProperty("top_p");
  });

  test("sets options.num_ctx from defaults.numCtx (vá tràn context — Ollama mặc định 4096)", () => {
    const p = buildOllamaPayload({}, history, { ...defaults, numCtx: 16384 });
    expect(p.options.num_ctx).toBe(16384);
    // không truyền numCtx → không set (giữ default của Ollama)
    expect(buildOllamaPayload({}, history, defaults).options).not.toHaveProperty("num_ctx");
  });

  test("presence_penalty: default server-side khi FE vắng; body override (chống lặp Qwen3-Q8)", () => {
    // luôn set để giảm lặp; default 0.2 khi không gửi
    expect(buildOllamaPayload({}, history, defaults).options.presence_penalty).toBe(0.2);
    // body override (kể cả 0)
    expect(buildOllamaPayload({ presencePenalty: 0 }, history, defaults).options.presence_penalty).toBe(0);
    expect(buildOllamaPayload({ presencePenalty: 0.3 }, history, defaults).options.presence_penalty).toBe(0.3);
  });
});

describe("harness wiring", () => {
  test("internal laam tools luôn có trong schema cho model (kể cả 0 connector)", () => {
    const names = modelToolSchemas(INTERNAL_TOOLS, []).map((t) => t.function.name);
    expect(names).toContain("laam_list_agents");
    expect(names).toContain("laam_find_stuck");
    expect(names.every((n) => typeof n === "string")).toBe(true);
  });
});

describe("SP-2 confirm body detection", () => {
  test("nhận diện body confirm", () => {
    expect(isConfirmBody({ confirm: { token: "t", approve: true } })).toBe(true);
  });
  test("body message thường → không phải confirm", () => {
    expect(isConfirmBody({ message: "hi" })).toBe(false);
    expect(isConfirmBody({})).toBe(false);
    expect(isConfirmBody({ confirm: null })).toBe(false);
  });
});
