import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/connectors", () => ({ list: vi.fn(async () => []) }));
vi.mock("@/lib/workflow/ollama", () => ({ callOllamaGenerate: vi.fn() }));

import { POST } from "./route";
import { auth } from "@/auth";
import { callOllamaGenerate } from "@/lib/workflow/ollama";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const genMock = callOllamaGenerate as unknown as ReturnType<typeof vi.fn>;
const authed = () => authMock.mockResolvedValue({ user: { id: "u1" } });
const req = (body: unknown) =>
  new Request("http://x/api/workflows/generate", { method: "POST", body: JSON.stringify(body) });

// single agent node, no edges → assertRunnable passes
const VALID = JSON.stringify({ nodes: [{ id: "a", kind: "agent", prompt: "hi" }], edges: [] });
// a lone condition node has 0 out-edges (needs exactly true+false) → assertRunnable throws
const INVALID = JSON.stringify({ nodes: [{ id: "c", kind: "condition", when: {} }], edges: [] });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/workflows/generate", () => {
  test("401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(req({ prompt: "x" }))).status).toBe(401);
  });

  test("400 on an empty prompt", async () => {
    authed();
    expect((await POST(req({ prompt: "   " }))).status).toBe(400);
  });

  test("200 with a valid coerced graph", async () => {
    authed();
    genMock.mockResolvedValue(VALID);
    const res = await POST(req({ prompt: "make a flow" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { graph: { nodes: { id: string }[] } };
    expect(body.graph.nodes[0].id).toBe("a");
  });

  test("retries once when the first graph is invalid, then succeeds (self-repair)", async () => {
    authed();
    genMock.mockResolvedValueOnce(INVALID).mockResolvedValueOnce(VALID);
    const res = await POST(req({ prompt: "x" }));
    expect(res.status).toBe(200);
    expect(genMock).toHaveBeenCalledTimes(2); // generate + one repair attempt
  });

  test("422 when the model returns an invalid graph twice", async () => {
    authed();
    genMock.mockResolvedValue(INVALID);
    const res = await POST(req({ prompt: "x" }));
    expect(res.status).toBe(422);
    expect(genMock).toHaveBeenCalledTimes(2);
  });

  test("502 when the local model is unreachable", async () => {
    authed();
    genMock.mockRejectedValue(new Error("Ollama 500"));
    expect((await POST(req({ prompt: "x" }))).status).toBe(502);
  });

  test("edit mode: `current` turns the model message into an edit instruction (refine)", async () => {
    authed();
    genMock.mockResolvedValue(VALID);
    const current = { nodes: [{ id: "x", kind: "agent", prompt: "old" }], edges: [] };
    expect((await POST(req({ prompt: "đổi sang Gmail", current }))).status).toBe(200);
    const messages = genMock.mock.calls[0][0] as { role: string; content: string }[];
    const userMsg = messages.find((m) => m.role === "user")!;
    expect(userMsg.content).toContain("Workflow hiện tại");
    expect(userMsg.content).toContain("đổi sang Gmail");
  });
});
