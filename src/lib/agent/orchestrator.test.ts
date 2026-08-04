import { describe, expect, test, vi } from "vitest";
// MIGRATED từ src/app/api/chat/tool-loop.test.ts: runToolRounds nay ở đây và nhận
// deps.dispatch (trước là deps.execute). orchestrator.ts chỉ import 1 TYPE từ
// @/lib/connectors → không cần mock module nào. (File cũ bị xoá ở task sau.)
import { runToolRounds, seedRequestedTool } from "./orchestrator";
import type { ChatMessage } from "./orchestrator";
import { PendingWriteSignal } from "@/lib/agent/safety/gate";

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

  test("không tool_calls và KHÔNG có tool khả dụng → trả nguyên, không gọi dispatch", async () => {
    const callOllama = vi.fn(async () => ({ message: { content: "Hi there." } }));
    const dispatch = vi.fn(async () => ({}));
    const out = await runToolRounds(baseMessages, [], { callOllama, dispatch });
    expect(dispatch).not.toHaveBeenCalled();
    expect(callOllama).toHaveBeenCalledTimes(1);
    expect(out).toEqual(baseMessages);
  });

  // G4 — grounding guard. WHY: đo thực tế trên gpt-oss-120b (17 lượt voice) có lượt
  // model trả lời NGAY ở vòng 0 với 0 tool call và BỊA dữ liệu ("dự án phần mềm quy
  // mô trung bình, người đứng đầu là…") trong khi tool đọc dữ liệu thật đang có sẵn.
  // Guard hỏi lại ĐÚNG MỘT lần với lời nhắc — nudge có đường thoát "nếu không cần thì
  // trả lời trực tiếp" nên chitchat KHÔNG bị ép gọi tool. Nếu latch 1-lần hỏng, một
  // model không bao giờ gọi tool sẽ quay vòng tới backstop → các test này phải đỏ.
  const GROUND =
    "Câu hỏi này có thể cần dữ liệu thật từ hệ thống. Nếu cần, hãy gọi công cụ phù hợp trước khi trả lời; nếu không cần thì trả lời trực tiếp.";

  test("G4: vòng 0 không gọi tool dù có tool → chèn nhắc grounding, model gọi tool ở vòng sau", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "Repo của bạn gồm A, B và C." } }) // bịa: chưa gọi tool nào
      .mockResolvedValueOnce({
        message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: {} } }] },
      })
      .mockResolvedValueOnce({ message: { content: "Đây là repo thật." } });
    const dispatch = vi.fn(async () => [{ name: "laam" }]);

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    expect(out.some((m) => m.content === GROUND)).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1); // đã đi lấy dữ liệu thật thay vì bịa
    expect(callOllama).toHaveBeenCalledTimes(3);
  });

  test("G4: chỉ nhắc MỘT lần — model vẫn không gọi tool → dừng, không quay vòng", async () => {
    const callOllama = vi.fn(async () => ({ message: { content: "Chào bạn!" } }));
    const dispatch = vi.fn(async () => ({}));

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    expect(callOllama).toHaveBeenCalledTimes(2); // 1 lần đầu + đúng 1 lần hỏi lại
    expect(dispatch).not.toHaveBeenCalled(); // chitchat không bị ép gọi tool
    expect(out.filter((m) => m.content === GROUND)).toHaveLength(1);
  });

  test("G4: KHÔNG nhắc khi lượt đã thực sự gọi tool (vòng > 0 dừng tự nhiên)", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({
        message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: {} } }] },
      })
      .mockResolvedValueOnce({ message: { content: "Xong." } });
    const dispatch = vi.fn(async () => [{ name: "laam" }]);

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    expect(out.some((m) => m.content === GROUND)).toBe(false);
    expect(callOllama).toHaveBeenCalledTimes(2);
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

  // Run-until-done: the loop's PRIMARY exit is natural completion (model stops calling
  // tools). The backstop is only a runaway guard; onBackstop must NOT fire on a normal
  // multi-step finish — this is the whole point of the redesign.
  test("natural completion → finishes on its own, onBackstop NOT fired", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: { page: 1 } } }] } })
      .mockResolvedValueOnce({ message: { content: "Done." } }); // model stops by itself
    const dispatch = vi.fn(async () => ({ ok: true }));
    const onBackstop = vi.fn();
    await runToolRounds(baseMessages, tools, { callOllama, dispatch }, { onBackstop });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(onBackstop).not.toHaveBeenCalled();
  });

  // Multi-step task completes well past the OLD cap of 3: 6 distinct reads + finish, all
  // dispatched, no premature cutoff. "Get 10 emails" no longer dies at round 3.
  test("multi-step — 6 distinct tool calls all complete (was capped at 3)", async () => {
    let n = 0;
    const callOllama = vi.fn(async () =>
      n < 6
        ? { message: { content: "", tool_calls: [{ function: { name: "gmail_get_message", arguments: { id: `m${n++}` } } }] } }
        : { message: { content: "Summarized all." } },
    );
    const dispatch = vi.fn(async () => ({ body: "email" }));
    const onBackstop = vi.fn();
    await runToolRounds(baseMessages, tools, { callOllama, dispatch }, { onBackstop });
    expect(dispatch).toHaveBeenCalledTimes(6); // all 6 distinct reads ran — not truncated
    expect(onBackstop).not.toHaveBeenCalled(); // natural finish, not a backstop hit
  });

  // The backstop fires only on a genuine runaway (model keeps calling DIFFERENT tools
  // forever). It force-disables tools on the final round and signals onBackstop.
  test("backstop — runaway model (distinct args) stops at maxRounds, forces text, fires onBackstop", async () => {
    let n = 0;
    const callOllama = vi.fn(async (_m: unknown, _t: unknown) => ({
      message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: { page: n++ } } }] },
    }));
    const dispatch = vi.fn(async () => ({ ok: true }));
    const onBackstop = vi.fn();
    await runToolRounds(baseMessages, tools, { callOllama, dispatch }, { maxRounds: 5, onBackstop });
    expect(callOllama).toHaveBeenCalledTimes(5);
    expect(callOllama.mock.calls.at(-1)![1]).toEqual([]); // final round: tools disabled (forced text)
    expect(dispatch).toHaveBeenCalledTimes(4); // rounds 0..3 dispatched; round 4 forced text
    expect(onBackstop).toHaveBeenCalledTimes(1);
  });

  // Repeat-guard: the SAME tool+args 3× = stuck → stop dispatching it, tell the model,
  // end gracefully (onBackstop). Catches the stuck-agent loop without a low round cap.
  test("repeat-guard — same tool+args 3× → break, 3rd not dispatched, onBackstop fires", async () => {
    const callOllama = vi.fn(async () => ({
      message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: { q: "same" } } }] },
    }));
    const dispatch = vi.fn(async () => ({ ok: true }));
    const onBackstop = vi.fn();
    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch }, { onBackstop });
    expect(dispatch).toHaveBeenCalledTimes(2); // 1st + 2nd dispatched; 3rd identical → skipped
    expect(onBackstop).toHaveBeenCalledTimes(1);
    expect(out.some((m) => m.role === "tool" && String(m.content).includes("cùng tham số"))).toBe(true);
  });

  // In-loop eviction fires on a tight budget so a long run doesn't overflow the model
  // window: oldest tool results become stubs, the most recent are kept verbatim.
  test("in-loop eviction — tight budget clears oldest tool results during a long run", async () => {
    let n = 0;
    const big = "Z".repeat(5000);
    const callOllama = vi.fn(async () =>
      n < 5
        ? { message: { content: "", tool_calls: [{ function: { name: "gmail_get_message", arguments: { id: `m${n++}` } } }] } }
        : { message: { content: "Done." } },
    );
    const dispatch = vi.fn(async () => big); // each result ~5000 chars
    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch }, { budgetChars: 8000, keepRecent: 2 });
    const toolMsgs = out.filter((m) => m.role === "tool");
    expect(toolMsgs.some((m) => String(m.content).includes("cleared to save context"))).toBe(true);
    expect(toolMsgs.at(-1)!.content).toBe(JSON.stringify(big)); // most recent kept verbatim
  });
});

// Task 2 — Larvis display panel wiring. onView gom descriptor suốt lượt (có thể có
// hàng chục tool result) và chỉ phát ĐÚNG MỘT LẦN sau khi vòng lặp kết thúc, chọn
// bảng/biểu đồ CUỐI CÙNG (pickTurnView) — để drilldown list→detail hiện bước chi
// tiết chứ không phải bước liệt kê ban đầu.
describe("onView", () => {
  const rows = (tag: string) => [{ name: `${tag}-1`, n: 1 }, { name: `${tag}-2`, n: 2 }];

  test("gọi ĐÚNG MỘT LẦN cho cả lượt, dù có nhiều tool result", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "list", arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "detail", arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: "xong" } });
    const dispatch = vi.fn(async (name: string) => rows(name));
    const onView = vi.fn();

    await runToolRounds(baseMessages, tools, { callOllama, dispatch }, { onView });

    expect(onView).toHaveBeenCalledTimes(1);
  });

  test("chọn tool result CUỐI CÙNG — bước chi tiết, không phải bước liệt kê", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "list", arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "detail", arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: "xong" } });
    const dispatch = vi.fn(async (name: string) => rows(name));
    const onView = vi.fn();

    await runToolRounds(baseMessages, tools, { callOllama, dispatch }, { onView });

    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ source: expect.objectContaining({ toolName: "detail" }) }));
  });

  test("KHÔNG gọi khi lượt không có tool result nào dựng được descriptor", async () => {
    const callOllama = vi.fn(async () => ({ message: { content: "chào bạn" } }));
    const dispatch = vi.fn(async () => ({}));
    const onView = vi.fn();

    await runToolRounds(baseMessages, [], { callOllama, dispatch }, { onView });

    expect(onView).not.toHaveBeenCalled();
  });

  // Review finding: the drilldown-branch collection site (deriveFromToolResult(plan.name,
  // detail, ...) near the drilldown detail push) was implemented but never exercised — the
  // 3 tests above only drive the MAIN dispatch branch. This test configures drilldownPairs
  // so the drilldown branch actually runs, and makes the LIST result deliberately NOT
  // descriptor-worthy (1 record, <2 keys) so the only possible source of the emitted view is
  // the drilldown branch's plan.name/detail — proving that specific code path, not just "the
  // loop ran and onView fired from somewhere".
  test("drilldown: descriptor phát ra là của BƯỚC CHI TIẾT (plan.name/detail), không phải bước liệt kê", async () => {
    const drilldownPairs = [
      { listTool: "x_list_projects", idField: "id", nameField: "name", detailTool: "x_get_master_record", idArg: "project_id" },
    ];
    const listResult = { projects: [{ id: "id-dasin", name: "Dasin" }] }; // 1 record — không dựng được descriptor
    const askDetail: ChatMessage[] = [
      { role: "system", content: "SYS" },
      { role: "user", content: "Cho mình thông tin chi tiết project Dasin" },
    ];
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "x_list_projects", arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: "Xong." } });
    const dispatch = vi.fn(async (name: string) => (name === "x_list_projects" ? listResult : rows("detail")));
    const onView = vi.fn();

    await runToolRounds(askDetail, tools, { callOllama, dispatch }, { drilldownPairs, onView });

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith(
      expect.objectContaining({ source: expect.objectContaining({ toolName: "x_get_master_record" }) }),
    );
  });
});

describe("seedRequestedTool (P1 - user picked tool, code dispatches)", () => {
  test("append dung shape tool-turn cua runToolRounds + dispatch dung args", async () => {
    const convo: ChatMessage[] = [{ role: "user", content: "tra cuu ca hoi" }];
    const dispatch = vi.fn(async () => ({ rows: [] as unknown[] }));
    await seedRequestedTool(convo, { name: "mcp__daab__kg_query", args: { project_id: "1f991b74-x" } }, dispatch);
    expect(dispatch).toHaveBeenCalledWith("mcp__daab__kg_query", { project_id: "1f991b74-x" });
    expect(convo[1]).toMatchObject({
      role: "assistant",
      tool_calls: [{ function: { name: "mcp__daab__kg_query", arguments: { project_id: "1f991b74-x" } } }],
    });
    expect(convo[2]).toEqual({ role: "tool", content: JSON.stringify({ rows: [] }) });
  });

  // D2 — drilldown xác định trong tool-loop. Logic khớp tên nằm ở drilldown.ts (đã test
  // riêng); ở đây chỉ chốt phần WIRING: có chạy tiếp không, có đúng một lần không, và
  // kết quả có vào convo đúng shape tool-turn để trace/citation nhìn thấy không.
  const PAIRS = [
    { listTool: "x_list_projects", idField: "id", nameField: "name", detailTool: "x_get_master_record", idArg: "project_id" },
  ];
  const listResult = { projects: [{ id: "id-dasin", name: "Dasin" }] };
  const askDetail: ChatMessage[] = [
    { role: "system", content: "SYS" },
    { role: "user", content: "Cho mình thông tin chi tiết project Dasin" },
  ];

  test("D2: sau tool liệt kê, CODE gọi tiếp tool chi tiết — model không phải tự chọn", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "x_list_projects", arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: "Xong." } });
    const dispatch = vi.fn(async (name: string) =>
      name === "x_list_projects" ? listResult : { master: "hồ sơ đầy đủ" },
    );

    const out = await runToolRounds(askDetail, tools, { callOllama, dispatch }, { drilldownPairs: PAIRS });

    expect(dispatch).toHaveBeenNthCalledWith(2, "x_get_master_record", { project_id: "id-dasin" });
    // Shape tool-turn đầy đủ (assistant tool_call + tool result) như seedRequestedTool
    const idx = out.findIndex((m) => m.content === JSON.stringify({ master: "hồ sơ đầy đủ" }));
    expect(idx).toBeGreaterThan(0);
    expect(out[idx - 1]).toMatchObject({
      role: "assistant",
      tool_calls: [{ function: { name: "x_get_master_record", arguments: { project_id: "id-dasin" } } }],
    });
  });

  test("D2: KHÔNG chạy khi câu hỏi không nhắc tên nào (câu 'liệt kê' giữ nguyên 1 tool)", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "x_list_projects", arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: "Có 1 project." } });
    const dispatch = vi.fn(async () => listResult);

    await runToolRounds(
      [{ role: "system", content: "SYS" }, { role: "user", content: "Liệt kê các project" }],
      tools,
      { callOllama, dispatch },
      { drilldownPairs: PAIRS },
    );

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test("D2: chỉ chạy MỘT lần/lượt dù model gọi lại tool liệt kê", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "x_list_projects", arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "x_list_projects", arguments: { again: 1 } } }] } })
      .mockResolvedValueOnce({ message: { content: "Xong." } });
    const dispatch = vi.fn(async (name: string) =>
      name === "x_list_projects" ? listResult : { master: "hồ sơ đầy đủ" },
    );

    await runToolRounds(askDetail, tools, { callOllama, dispatch }, { drilldownPairs: PAIRS });

    expect(dispatch.mock.calls.filter((c) => c[0] === "x_get_master_record")).toHaveLength(1);
  });

  test("D2: tool chi tiết lỗi → nuốt lỗi, lượt vẫn trả lời được bằng dữ liệu liệt kê", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "x_list_projects", arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: "Trả lời với dữ liệu có được." } });
    const dispatch = vi.fn(async (name: string) => {
      if (name === "x_list_projects") return listResult;
      throw new Error("detail tool down");
    });

    const out = await runToolRounds(askDetail, tools, { callOllama, dispatch }, { drilldownPairs: PAIRS });
    expect(out.length).toBeGreaterThan(0); // không ném ra ngoài
  });

  test("D2: KHÔNG cấu hình cặp nào → hành vi y hệt trước (mặc định tắt)", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({ message: { content: "", tool_calls: [{ function: { name: "x_list_projects", arguments: {} } }] } })
      .mockResolvedValueOnce({ message: { content: "Xong." } });
    const dispatch = vi.fn(async () => listResult);

    await runToolRounds(askDetail, tools, { callOllama, dispatch });

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test("write tool -> PendingWriteSignal propagate (gate giu nguyen), KHONG append result", async () => {
    const convo: ChatMessage[] = [{ role: "user", content: "tao task" }];
    const dispatch = vi.fn(async () => {
      throw new PendingWriteSignal("demo_create_task", { title: "x" });
    });
    await expect(
      seedRequestedTool(convo, { name: "demo_create_task", args: { title: "x" } }, dispatch),
    ).rejects.toBeInstanceOf(PendingWriteSignal);
    expect(convo.some((m) => m.role === "tool")).toBe(false);
  });
});