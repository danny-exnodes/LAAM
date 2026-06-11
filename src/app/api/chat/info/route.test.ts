import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));

import { GET } from "./route";

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
});
