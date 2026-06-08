import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/connectors", () => ({ list: vi.fn(async () => []) }));
vi.mock("@/lib/workflow/ollama", () => ({ callOllamaChat: vi.fn() }));

import { POST } from "./route";
import { auth } from "@/auth";
import { callOllamaChat } from "@/lib/workflow/ollama";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const chatMock = callOllamaChat as unknown as ReturnType<typeof vi.fn>;
const authed = () => authMock.mockResolvedValue({ user: { id: "u1" } });
const req = (body: unknown) =>
  new Request("http://x/api/workflows/review", { method: "POST", body: JSON.stringify(body) });
const graph = { nodes: [{ id: "a", kind: "agent", prompt: "x" }], edges: [] };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/workflows/review", () => {
  test("401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(req({ graph }))).status).toBe(401);
  });

  test("400 when graph is missing", async () => {
    authed();
    expect((await POST(req({}))).status).toBe(400);
  });

  test("200 with the model's review text", async () => {
    authed();
    chatMock.mockResolvedValue({ message: { content: "## Tóm tắt\nflow ổn" } });
    const res = await POST(req({ graph }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { review: string }).review).toContain("Tóm tắt");
  });

  test("502 when the model is unreachable", async () => {
    authed();
    chatMock.mockRejectedValue(new Error("Ollama 500"));
    expect((await POST(req({ graph }))).status).toBe(502);
  });

  test("502 when the model returns empty content", async () => {
    authed();
    chatMock.mockResolvedValue({ message: { content: "   " } });
    expect((await POST(req({ graph }))).status).toBe(502);
  });
});
