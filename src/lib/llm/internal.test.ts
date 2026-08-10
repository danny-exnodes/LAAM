import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the three providers so we assert the ROUTER's dispatch, not real network.
vi.mock("./byteplus", () => ({
  BYTEPLUS_MODELS: ["gpt-oss-120b"],
  isBytePlusModel: (m: string) => m === "gpt-oss-120b",
  byteplusChat: vi.fn(async () => ({ message: { content: "BP" } })),
}));
vi.mock("./cerebras", () => ({
  CEREBRAS_MODELS: ["gpt-oss-120b-cerebras"],
  isCerebrasModel: (m: string) => m === "gpt-oss-120b-cerebras",
  cerebrasChat: vi.fn(async () => ({ message: { content: "CB" } })),
}));
vi.mock("./claude", () => ({
  CLAUDE_MODELS: ["claude-opus-4-8"],
  isClaudeModel: (m: string) => m === "claude-opus-4-8",
  claudeStream: vi.fn(async function* () {
    yield { delta: "CL" };
  }),
}));
vi.mock("./ollama", () => ({
  ollamaChat: vi.fn(async () => ({ message: { content: "OL" } })),
}));

import { resolveInternalModel, callModelText, callModelChat, callModelGenerate } from "./internal";
import { byteplusChat } from "./byteplus";
import { cerebrasChat } from "./cerebras";
import { ollamaChat } from "./ollama";

describe("resolveInternalModel — cloud-first priority", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("INTERNAL_MODEL override wins over everything", () => {
    vi.stubEnv("INTERNAL_MODEL", "custom-x");
    vi.stubEnv("BYTEPLUS_API_KEY", "k");
    expect(resolveInternalModel()).toBe("custom-x");
  });
  test("BytePlus key set → cloud-first BytePlus model", () => {
    vi.stubEnv("INTERNAL_MODEL", "");
    vi.stubEnv("BYTEPLUS_API_KEY", "k");
    vi.stubEnv("CEREBRAS_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(resolveInternalModel()).toBe("gpt-oss-120b");
  });
  test("no BytePlus but Cerebras key → Cerebras model", () => {
    vi.stubEnv("INTERNAL_MODEL", "");
    vi.stubEnv("BYTEPLUS_API_KEY", "");
    vi.stubEnv("CEREBRAS_API_KEY", "k");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(resolveInternalModel()).toBe("gpt-oss-120b-cerebras");
  });
  test("no BytePlus/Cerebras but Anthropic key → Claude model", () => {
    vi.stubEnv("INTERNAL_MODEL", "");
    vi.stubEnv("BYTEPLUS_API_KEY", "");
    vi.stubEnv("CEREBRAS_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    expect(resolveInternalModel()).toBe("claude-opus-4-8");
  });
  test("no cloud key → DEFAULT_CHAT_MODEL (local $0 path unchanged)", () => {
    vi.stubEnv("INTERNAL_MODEL", "");
    vi.stubEnv("BYTEPLUS_API_KEY", "");
    vi.stubEnv("CEREBRAS_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("DEFAULT_CHAT_MODEL", "qwen-local");
    expect(resolveInternalModel()).toBe("qwen-local");
  });
});

describe("callModelText — provider dispatch (no tools)", () => {
  beforeEach(() => vi.clearAllMocks());
  test("BytePlus model → byteplusChat", async () => {
    expect(await callModelText("hi", "gpt-oss-120b")).toBe("BP");
    expect(byteplusChat).toHaveBeenCalledTimes(1);
  });
  test("Cerebras model → cerebrasChat", async () => {
    expect(await callModelText("hi", "gpt-oss-120b-cerebras")).toBe("CB");
    expect(cerebrasChat).toHaveBeenCalledTimes(1);
  });
  test("Claude model → claudeStream collected to text", async () => {
    expect(await callModelText("hi", "claude-opus-4-8")).toBe("CL");
  });
  test("local model → ollamaChat", async () => {
    expect(await callModelText("hi", "qwen-local")).toBe("OL");
    expect(ollamaChat).toHaveBeenCalledTimes(1);
  });
});

describe("callModelChat — provider dispatch (with tools)", () => {
  beforeEach(() => vi.clearAllMocks());
  test("BytePlus model → byteplusChat, returns Ollama shape", async () => {
    const r = await callModelChat([{ role: "user", content: "x" }], [{ type: "function" }], undefined, "gpt-oss-120b");
    expect(r.message?.content).toBe("BP");
  });
  test("Cerebras model → cerebrasChat, returns Ollama shape", async () => {
    const r = await callModelChat([{ role: "user", content: "x" }], [{ type: "function" }], undefined, "gpt-oss-120b-cerebras");
    expect(r.message?.content).toBe("CB");
  });
  test("Claude model → fail loud (no-tool MVS cannot run tool steps)", async () => {
    await expect(callModelChat([], [], undefined, "claude-opus-4-8")).rejects.toThrow(/no-tool/);
  });
  test("local model → ollamaChat with format forwarded", async () => {
    await callModelChat([{ role: "user", content: "x" }], [], { type: "object" }, "qwen-local");
    expect(ollamaChat).toHaveBeenCalledWith(expect.objectContaining({ format: { type: "object" } }));
  });
});

describe("callModelGenerate — structured one-shot", () => {
  beforeEach(() => vi.clearAllMocks());
  test("BytePlus model → byteplusChat content", async () => {
    expect(await callModelGenerate([{ role: "user", content: "x" }], { type: "object" }, "gpt-oss-120b")).toBe("BP");
  });
  test("Cerebras model → cerebrasChat content", async () => {
    expect(await callModelGenerate([{ role: "user", content: "x" }], { type: "object" }, "gpt-oss-120b-cerebras")).toBe("CB");
  });
  test("local model → ollamaChat with format + low temperature", async () => {
    await callModelGenerate([{ role: "user", content: "x" }], { type: "object" }, "qwen-local");
    expect(ollamaChat).toHaveBeenCalledWith(expect.objectContaining({ format: { type: "object" }, temperature: 0.2 }));
  });
});
