import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth BEFORE importing the route (session-gated handler)
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));

import { POST } from "./route";

describe("POST /api/tts", () => {
  beforeEach(() => { vi.restoreAllMocks(); delete process.env.CONSTELLATION_TTS_URL; });

  it("501s when no endpoint configured", async () => {
    const res = await POST(new Request("http://x/api/tts", { method: "POST", body: JSON.stringify({ text: "hi", lang: "vi" }) }));
    expect(res.status).toBe(501);
  });

  it("forwards to the configured endpoint and streams wav", async () => {
    process.env.CONSTELLATION_TTS_URL = "http://tts.local/say";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8), headers: new Headers({ "content-type": "audio/wav" }) }) as unknown as Response));
    const res = await POST(new Request("http://x/api/tts", { method: "POST", body: JSON.stringify({ text: "hi", lang: "vi" }) }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("audio/wav");
  });
});
