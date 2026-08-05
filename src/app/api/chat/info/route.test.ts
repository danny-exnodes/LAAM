import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));

import { GET } from "./route";
import { BYTEPLUS_MODELS } from "@/lib/llm/byteplus";

afterEach(() => {
  h.authResult = null;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/chat/info", () => {
  test("401 when unauthenticated", async () => {
    h.authResult = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("200 returns the default chat model", async () => {
    h.authResult = { user: { id: "u1" } };
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.model).toBe("string");
    expect(body.model.length).toBeGreaterThan(0);
  });

  // Cloud-first: a server holding a BytePlus key preselects the BytePlus default so the
  // chat does not open on a local model that may be off. Asserted as a LITERAL — the
  // chat default must not silently change when the whitelist is reordered.
  test("model = gpt-oss-120b when BYTEPLUS_API_KEY is set, even with DEFAULT_CHAT_MODEL", async () => {
    vi.stubEnv("BYTEPLUS_API_KEY", "bp-test");
    vi.stubEnv("DEFAULT_CHAT_MODEL", "gemma4:e4b");
    h.authResult = { user: { id: "u1" } };
    const body = await (await GET()).json();
    expect(body.model).toBe("gpt-oss-120b");
  });

  test("model = DEFAULT_CHAT_MODEL when no BYTEPLUS_API_KEY (local-only stays free)", async () => {
    vi.stubEnv("BYTEPLUS_API_KEY", "");
    vi.stubEnv("DEFAULT_CHAT_MODEL", "gemma4:e4b");
    h.authResult = { user: { id: "u1" } };
    const body = await (await GET()).json();
    expect(body.model).toBe("gemma4:e4b");
  });

  // C1: claudeModels = whitelist CHỈ khi server có ANTHROPIC_API_KEY (đọc lúc
  // request, không lúc import) — không key thì picker không hiện model Claude.
  test("claudeModels = whitelist khi có ANTHROPIC_API_KEY", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    h.authResult = { user: { id: "u1" } };
    const body = await (await GET()).json();
    expect(body.claudeModels).toEqual(["claude-sonnet-4-6", "claude-opus-4-8"]);
  });

  test("claudeModels = [] khi không có ANTHROPIC_API_KEY", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    h.authResult = { user: { id: "u1" } };
    const body = await (await GET()).json();
    expect(body.claudeModels).toEqual([]);
  });

  // Same env-gated pattern for BytePlus: the picker only offers BytePlus models when
  // the server holds a BYTEPLUS_API_KEY (read at request time, not import).
  test("byteplusModels = whitelist khi có BYTEPLUS_API_KEY", async () => {
    vi.stubEnv("BYTEPLUS_API_KEY", "bp-test");
    h.authResult = { user: { id: "u1" } };
    const body = await (await GET()).json();
    expect(body.byteplusModels).toEqual([...BYTEPLUS_MODELS]);
  });

  test("byteplusModels = [] khi không có BYTEPLUS_API_KEY", async () => {
    vi.stubEnv("BYTEPLUS_API_KEY", "");
    h.authResult = { user: { id: "u1" } };
    const body = await (await GET()).json();
    expect(body.byteplusModels).toEqual([]);
  });
});
