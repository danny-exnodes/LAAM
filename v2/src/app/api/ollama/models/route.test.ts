import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));

import { GET } from "./route";

afterEach(() => {
  h.authResult = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/ollama/models", () => {
  test("401 when unauthenticated", async () => {
    h.authResult = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("200 returns the list of model names from Ollama tags", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ models: [{ name: "gemma4:e4b" }, { name: "qwen3-vl:8b" }] }),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ models: ["gemma4:e4b", "qwen3-vl:8b"] });
  });

  test("200 with empty list when Ollama returns a bad shape", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ nope: true }));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ models: [] });
  });

  test("502 when Ollama is unreachable", async () => {
    h.authResult = { user: { id: "u1" } };
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
