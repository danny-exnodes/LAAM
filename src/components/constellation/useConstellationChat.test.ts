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

  it("frame view được chuyển ra onView", async () => {
    const d = { kind: "table", title: "t", source: { type: "tool", toolName: "t", at: 1 }, rows: [{ a: 1 }] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          `Xong.${SEP}${JSON.stringify({ t: "view", d })}${SEP}`,
        ])
      )
    );
    const seen: unknown[] = [];
    const { result } = renderHook(() =>
      useConstellationChat({ onText: () => {}, onPendingWrite: () => {}, onView: (v) => seen.push(v) })
    );
    await act(async () => { await result.current.send({ message: "hỏi", model: "gemma4:e4b" }); });
    expect(seen).toEqual([d]);
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

  // Progress signal for the Larvis caption. A voice turn takes 15-30s (measured on the
  // pharmacy question set) and the subtitle strip is EMPTY that whole time, so the page looks
  // frozen. Tool-call frames already arrive on this stream — they were simply dropped — and
  // they are the only live evidence the agent is still working.
  //
  // Reported as a RUNNING TOTAL, not an increment: splitFrames() re-parses the whole
  // accumulated buffer on every chunk, so the same frame is seen many times. Counting the
  // frames present is naturally idempotent; incrementing per sighting would inflate wildly.
  it("reports tool-call progress as a running total, once per new call", async () => {
    const call = (name: string, c: number) =>
      `${SEP}{"t":"tool","phase":"call","c":${c},"name":"${name}"}${SEP}`;
    const result = (name: string, c: number) =>
      `${SEP}{"t":"tool","phase":"result","c":${c},"name":"${name}","ok":true}${SEP}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          call("a", 0),
          result("a", 0), // a result must NOT advance the counter
          call("b", 1),
          "Xong.",
        ])
      )
    );
    const onActivity = vi.fn();
    const { result: hook } = renderHook(() =>
      useConstellationChat({ onText: () => {}, onPendingWrite: () => {}, onActivity })
    );

    await act(async () => {
      await hook.current.send({ message: "hi" });
    });

    expect(onActivity.mock.calls.map((c) => c[0])).toEqual([1, 2]);
  });

  it("restarts the progress count each turn", async () => {
    const call = (c: number) => `${SEP}{"t":"tool","phase":"call","c":${c},"name":"x"}${SEP}`;
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([call(0), "ok"])));
    const onActivity = vi.fn();
    const { result: hook } = renderHook(() =>
      useConstellationChat({ onText: () => {}, onPendingWrite: () => {}, onActivity })
    );

    await act(async () => {
      await hook.current.send({ message: "one" });
    });
    await act(async () => {
      await hook.current.send({ message: "two" });
    });

    // Second turn starts from 1 again — a stale count would make the caption claim the agent
    // is further along than it is.
    expect(onActivity.mock.calls.map((c) => c[0])).toEqual([1, 1]);
  });
});
