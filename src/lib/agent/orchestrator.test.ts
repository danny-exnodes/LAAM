import { describe, expect, test, vi } from "vitest";
// MIGRATED từ src/app/api/chat/tool-loop.test.ts: runToolRounds nay ở đây và nhận
// deps.dispatch (trước là deps.execute). orchestrator.ts chỉ import 1 TYPE từ
// @/lib/connectors → không cần mock module nào. (File cũ bị xoá ở task sau.)
import { runToolRounds } from "./orchestrator";
import type { ChatMessage } from "./orchestrator";

const tools = [
  { type: "function" as const, kind: "read" as const, function: { name: "github_list_repos", description: "list repos", parameters: {} } },
];
const baseMessages: ChatMessage[] = [
  { role: "system", content: "SYS" },
  { role: "user", content: "list my repos" },
];

describe("runToolRounds", () => {
  test("chạy tool_call, nối kết quả, trả messages cuối", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({
        message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: { visibility: "public" } } }] },
      })
      .mockResolvedValueOnce({ message: { content: "Here are your repos." } });
    const dispatch = vi.fn(async () => [{ name: "laam" }]);

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("github_list_repos", { visibility: "public" });
    expect(callOllama).toHaveBeenCalledTimes(2);
    expect(out.slice(0, 2)).toEqual(baseMessages);
    expect(out.find((m) => m.role === "assistant")).toBeTruthy();
    const toolMsg = out.find((m) => m.role === "tool");
    expect(toolMsg!.content).toBe(JSON.stringify([{ name: "laam" }]));
  });

  test("không tool_calls → trả nguyên, không gọi dispatch", async () => {
    const callOllama = vi.fn(async () => ({ message: { content: "Hi there." } }));
    const dispatch = vi.fn(async () => ({}));
    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });
    expect(dispatch).not.toHaveBeenCalled();
    expect(callOllama).toHaveBeenCalledTimes(1);
    expect(out).toEqual(baseMessages);
  });

  // QW-3 — nudge web_read sau web_search. WHY: model qwen3-vl hay trả lời ngay từ
  // trích đoạn search thay vì đọc URL; gợi ý này đẩy nó sang bước web_read. Nudge
  // chỉ đúng KHI thật sự đã web_search-ra-URL và CHƯA web_read — nếu logic đó hỏng
  // các test này phải đỏ.
  const NUDGE = "Bạn có thể gọi web_read với một URL ở trên để đọc nội dung đầy đủ trước khi trả lời.";

  test("QW-3: web_search ra URL → chèn nudge web_read, model thấy ở vòng sau", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({
        message: { content: "", tool_calls: [{ function: { name: "web_search", arguments: { query: "tin tức" } } }] },
      })
      .mockResolvedValueOnce({ message: { content: "Đã trả lời." } });
    const dispatch = vi.fn(async () => ({
      query: "tin tức",
      results: [{ title: "Bài 1", url: "https://example.com/a", snippet: "..." }],
    }));

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    // nudge có trong convo cuối, và là message NGAY SAU kết quả tool web_search
    const toolMsgs = out.filter((m) => m.role === "tool");
    expect(toolMsgs[toolMsgs.length - 1].content).toBe(NUDGE);
    // và model THỰC SỰ nhận được nudge ở vòng 2 (đây mới là mục đích — nhắc model)
    const round2Convo = callOllama.mock.calls[1][0] as ChatMessage[];
    expect(round2Convo.some((m) => m.content === NUDGE)).toBe(true);
  });

  test("QW-3: không web_search → không nudge (đường chat thường không đụng)", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({
        message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: {} } }] },
      })
      .mockResolvedValueOnce({ message: { content: "Xong." } });
    const dispatch = vi.fn(async () => [{ name: "laam" }]);

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    expect(out.some((m) => m.content === NUDGE)).toBe(false);
  });

  test("QW-3: web_search nhưng kết quả không có URL → không nudge", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({
        message: { content: "", tool_calls: [{ function: { name: "web_search", arguments: { query: "x" } } }] },
      })
      .mockResolvedValueOnce({ message: { content: "Xong." } });
    const dispatch = vi.fn(async () => ({ query: "x", results: [] }));

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    expect(out.some((m) => m.content === NUDGE)).toBe(false);
  });

  test("QW-3: đã web_read cùng vòng với web_search → không nudge", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({
        message: {
          content: "",
          tool_calls: [
            { function: { name: "web_search", arguments: { query: "x" } } },
            { function: { name: "web_read", arguments: { url: "https://example.com/a" } } },
          ],
        },
      })
      .mockResolvedValueOnce({ message: { content: "Xong." } });
    const dispatch = vi.fn(async (name: string) =>
      name === "web_search"
        ? { query: "x", results: [{ title: "t", url: "https://example.com/a", snippet: "s" }] }
        : { url: "https://example.com/a", text: "nội dung" },
    );

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    expect(out.some((m) => m.content === NUDGE)).toBe(false);
  });

  test("QW-3: convo đã có web_read ở lượt trước → web_search mới không nudge lại", async () => {
    // lịch sử mang sẵn một tool_call web_read (đường workflow nối nhiều lượt)
    const seeded: ChatMessage[] = [
      ...baseMessages,
      { role: "assistant", content: "", tool_calls: [{ function: { name: "web_read", arguments: { url: "https://a" } } }] },
      { role: "tool", content: JSON.stringify({ url: "https://a", text: "..." }) },
    ];
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({
        message: { content: "", tool_calls: [{ function: { name: "web_search", arguments: { query: "x" } } }] },
      })
      .mockResolvedValueOnce({ message: { content: "Xong." } });
    const dispatch = vi.fn(async () => ({
      query: "x",
      results: [{ title: "t", url: "https://example.com/a", snippet: "s" }],
    }));

    const out = await runToolRounds(seeded, tools, { callOllama, dispatch });

    expect(out.some((m) => m.content === NUDGE)).toBe(false);
  });

  test("QW-3: nudge chỉ chèn 1 lần dù nhiều vòng web_search", async () => {
    const searchResp = {
      message: { content: "", tool_calls: [{ function: { name: "web_search", arguments: { query: "x" } } }] },
    };
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce(searchResp)
      .mockResolvedValueOnce(searchResp)
      .mockResolvedValueOnce({ message: { content: "Xong." } });
    const dispatch = vi.fn(async () => ({
      query: "x",
      results: [{ title: "t", url: "https://example.com/a", snippet: "s" }],
    }));

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    const nudges = out.filter((m) => m.content === NUDGE);
    expect(nudges).toHaveLength(1);
  });

  test("bounded — dừng sau maxRounds dù model cứ gọi tool", async () => {
    const callOllama = vi.fn(async (_messages: unknown, _tools: unknown) => ({
      message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: {} } }] },
    }));
    const dispatch = vi.fn(async () => ({ ok: true }));
    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch }, 4);
    expect(callOllama).toHaveBeenCalledTimes(4);
    const lastCall = callOllama.mock.calls[callOllama.mock.calls.length - 1];
    expect(lastCall[1]).toEqual([]);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(out.slice(0, 2)).toEqual(baseMessages);
  });
});
