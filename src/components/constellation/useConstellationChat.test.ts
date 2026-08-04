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
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => streamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useConstellationChat({ onText: () => {}, onPendingWrite: () => {} })
    );
    await act(async () => { await result.current.send({ message: "hi", model: "gemma4:e4b" }); });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.mode).toBe("voice");
  });

  it("sends mode:'voice' in the POST body on confirm", async () => {
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => streamResponse(["done"]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useConstellationChat({ onText: () => {}, onPendingWrite: () => {} })
    );
    await act(async () => { await result.current.confirm("TOK", true); });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.mode).toBe("voice");
    expect(body.confirm).toEqual({ token: "TOK", approve: true });
  });

  // D3 — deep-link tiếp tục hội thoại: /chat truyền ?conv=<id> sang /constellation.
  // WHY: trước đây convId luôn khởi tạo undefined mỗi lần trang mount → mỗi lần bấm
  // icon Orbit là một hội thoại mới toanh, kể cả đang có sẵn hội thoại đang mở ở /chat
  // (xác nhận với người dùng: đúng là chủ đích v1 "no deep-link param", nay bổ sung).
  it("initialConversationId → lượt gửi ĐẦU TIÊN mang theo id đó, không tạo hội thoại mới", async () => {
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => streamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useConstellationChat({ onText: () => {}, onPendingWrite: () => {}, initialConversationId: "existing-conv-1" })
    );
    await act(async () => { await result.current.send({ message: "tiếp tục nhé", model: "gemma4:e4b" }); });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.conversationId).toBe("existing-conv-1");
  });

  it("expose conversationId hiện tại — ban đầu theo initialConversationId, sau đó theo header server trả về", async () => {
    const fetchMock = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => streamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useConstellationChat({ onText: () => {}, onPendingWrite: () => {} })
    );
    expect(result.current.conversationId).toBeUndefined(); // không có initial, chưa gửi gì
    await act(async () => { await result.current.send({ message: "hi", model: "gemma4:e4b" }); });
    expect(result.current.conversationId).toBe("c1"); // header x-conversation-id của streamResponse
  });
});
