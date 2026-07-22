import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConstellationChat } from "./useConstellationChat";

const SEP = "\x1e";
function streamResponse(chunks: string[]) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    headers: new Headers({ "x-conversation-id": "c1" }),
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: enc.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  } as unknown as Response;
}

describe("useConstellationChat", () => {
  it("accumulates streamed assistant text (ignoring frames) and reports done", async () => {
    // Rule 13: server may alter/prefix text between frames; we accumulate exactly what streams.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse(["Xin ", `${SEP}{"t":"tokens","i":5,"o":9}${SEP}`, "chào"])
      )
    );
    const texts: string[] = [];
    const { result } = renderHook(() =>
      useConstellationChat({ onText: (t) => { texts.push(t); }, onPendingWrite: () => {} })
    );
    await act(async () => { await result.current.send({ message: "hi", model: "gemma4:e4b" }); });
    expect(texts.at(-1)).toBe("Xin chào");
  });

  it("surfaces a pending_write frame instead of speaking it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          `${SEP}{"t":"pending_write","token":"TOK","tool":"trello_create_card","title":"Create","summary":"..."}${SEP}`,
        ])
      )
    );
    const pw = vi.fn();
    const { result } = renderHook(() =>
      useConstellationChat({ onText: () => {}, onPendingWrite: pw })
    );
    await act(async () => { await result.current.send({ message: "make a card", model: "gemma4:e4b" }); });
    expect(pw).toHaveBeenCalledWith(
      expect.objectContaining({ token: "TOK", tool: "trello_create_card" })
    );
  });

  it("sends mode:'voice' in the POST body on send", async () => {
    const fetchMock = vi.fn(async () => streamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useConstellationChat({ onText: () => {}, onPendingWrite: () => {} })
    );
    await act(async () => { await result.current.send({ message: "hi", model: "gemma4:e4b" }); });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.mode).toBe("voice");
  });

  it("sends mode:'voice' in the POST body on confirm", async () => {
    const fetchMock = vi.fn(async () => streamResponse(["done"]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useConstellationChat({ onText: () => {}, onPendingWrite: () => {} })
    );
    await act(async () => { await result.current.confirm("TOK", true); });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.mode).toBe("voice");
    expect(body.confirm).toEqual({ token: "TOK", approve: true });
  });
});
