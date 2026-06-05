import { afterEach, describe, expect, test, vi } from "vitest";
import { makeRealOllama } from "./ollama";

afterEach(() => vi.restoreAllMocks());

describe("makeRealOllama", () => {
  test("POST /api/chat với options prod + tools khi có; stream:false", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: { content: "ok" } }), { status: 200 }));
    const call = makeRealOllama({ baseUrl: "http://h:11434", model: "qwen3-vl:8b", options: { num_ctx: 16384, presence_penalty: 0.2 } });
    const res = await call([{ role: "user", content: "hi" }], [{ type: "function", function: { name: "t", description: "", parameters: {} } }] as never);
    expect(res.message?.content).toBe("ok");
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.stream).toBe(false);
    expect(body.options.num_ctx).toBe(16384);
    expect(body.tools).toHaveLength(1);
  });

  test("không gửi tools khi mảng rỗng (vòng cuối)", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: { content: "x" } }), { status: 200 }));
    const call = makeRealOllama({ baseUrl: "http://h:11434", model: "m", options: {} });
    await call([{ role: "user", content: "hi" }], [] as never);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect("tools" in body).toBe(false);
  });
});
