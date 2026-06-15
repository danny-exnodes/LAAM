import { describe, expect, test } from "vitest";
import { ollamaStream } from "./ollama";

// Fake a streaming Response whose body.getReader() replays the given chunks.
function resFrom(chunks: string[]): Response {
  let i = 0;
  return {
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false as const, value: new TextEncoder().encode(chunks[i++]) }
            : { done: true as const, value: undefined },
      }),
    },
  } as unknown as Response;
}

type Ev = { delta?: string; usage?: { in: number; out: number } };

async function drain(res: Response): Promise<Ev[]> {
  const out: Ev[] = [];
  for await (const ev of ollamaStream(res)) out.push(ev);
  return out;
}

describe("ollamaStream", () => {
  test("yields each content delta then a final usage from the done line", async () => {
    const out = await drain(
      resFrom([
        JSON.stringify({ message: { content: "chào " } }) + "\n",
        JSON.stringify({ message: { content: "bạn" }, done: true, prompt_eval_count: 7, eval_count: 3 }) + "\n",
      ]),
    );
    expect(out.filter((e) => e.delta).map((e) => e.delta)).toEqual(["chào ", "bạn"]);
    expect(out.at(-1)).toEqual({ usage: { in: 7, out: 3 } });
  });

  // A delta line can be split across two read() chunks; the buffer must reassemble
  // it (the route relies on this — Ollama frames don't align to chunk boundaries).
  test("tolerates a delta split across read() chunks (partial JSON line)", async () => {
    const line = JSON.stringify({ message: { content: "x" }, done: true, prompt_eval_count: 1, eval_count: 1 }) + "\n";
    const out = await drain(resFrom([line.slice(0, 10), line.slice(10)]));
    expect(out.filter((e) => e.delta).map((e) => e.delta)).toEqual(["x"]);
    expect(out.at(-1)).toEqual({ usage: { in: 1, out: 1 } });
  });

  // Ollama always emits a token frame (unlike Claude, which omits it when usage
  // never arrives) — so the generator yields usage 0/0 even with no done line.
  test("emits usage 0/0 when no done line arrives (always-emit Ollama semantics)", async () => {
    const out = await drain(resFrom([JSON.stringify({ message: { content: "hi" } }) + "\n"]));
    expect(out.at(-1)).toEqual({ usage: { in: 0, out: 0 } });
  });
});
