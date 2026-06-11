import { describe, expect, test, vi } from "vitest";
import { runResume, buildResumeMessages, buildResumeRequest } from "./resume";
import type { PendingWrite } from "./token";

const signed: PendingWrite = {
  v: 1,
  name: "trello_create_card",
  args: { idList: "l1", name: "Mua sữa" },
  conversationId: "c1",
  userId: "u1",
  iat: 0,
  exp: 9e15,
  nonce: "n1",
};
const system = "SYS";
const history = [
  { role: "user", content: "tạo card Mua sữa" },
  { role: "assistant", content: 'Tạo card "Mua sữa" trong danh sách l1.' },
];

function makeDeps(nonceUsed = false) {
  return {
    dispatch: vi.fn(async () => ({ card: { id: "c9" } })),
    isNonceUsed: vi.fn(async () => nonceUsed),
    recordWrite: vi.fn(async () => {}),
  };
}

describe("runResume", () => {
  test("approve + nonce mới → execute ĐÚNG 1 LẦN với signed args + audit", async () => {
    const d = makeDeps();
    const out = await runResume(signed, true, system, history, d);
    expect(d.dispatch).toHaveBeenCalledTimes(1);
    expect(d.dispatch).toHaveBeenCalledWith("trello_create_card", { idList: "l1", name: "Mua sữa" });
    expect(d.recordWrite).toHaveBeenCalledOnce();
    expect(out.status).toBe("executed");
    if (out.status === "executed") {
      expect(out.messages.at(-2)?.tool_calls?.[0]).toMatchObject({
        function: { name: "trello_create_card" },
      });
      expect(out.messages.at(-1)?.role).toBe("tool");
    }
  });
  test("nonce đã dùng → rejected, KHÔNG execute (chống replay)", async () => {
    const d = makeDeps(true);
    const out = await runResume(signed, true, system, history, d);
    expect(out.status).toBe("rejected");
    expect(d.dispatch).not.toHaveBeenCalled();
  });
  test("approve:false → cancelled, KHÔNG execute", async () => {
    const d = makeDeps();
    const out = await runResume(signed, false, system, history, d);
    expect(out.status).toBe("cancelled");
    expect(d.dispatch).not.toHaveBeenCalled();
  });
});

describe("buildResumeMessages", () => {
  test("kết thúc bằng assistant(tool_call) + tool(result CÓ NHÃN [Kết quả <tool>]); bỏ READ Turn 1", () => {
    const msgs = buildResumeMessages(system, history, signed, { card: { id: "c9" } });
    expect(msgs[0]).toEqual({ role: "system", content: "SYS" });
    expect(msgs.at(-2)?.tool_calls?.[0]).toMatchObject({
      function: { name: "trello_create_card", arguments: { idList: "l1", name: "Mua sữa" } },
    });
    // MINOR 5: JSON trần không nói nó là gì — nhãn tên tool giúp model (nhất là
    // Claude, nơi role:"tool" bị map thành user text) tường thuật đúng kết quả.
    expect(msgs.at(-1)).toEqual({
      role: "tool",
      content: '[Kết quả trello_create_card]: {"card":{"id":"c9"}}',
    });
  });

  test("result undefined → 'null' (JSON.stringify(undefined) là undefined — không được rò chữ 'undefined'/content rỗng)", () => {
    const msgs = buildResumeMessages(system, history, signed, undefined);
    expect(msgs.at(-1)).toEqual({ role: "tool", content: "[Kết quả trello_create_card]: null" });
  });
});

describe("buildResumeRequest", () => {
  test("KHÔNG có field tools (text-only về cấu trúc)", () => {
    const body = buildResumeRequest("gemma4:e4b", [], { temperature: 0.7 });
    expect(body).not.toHaveProperty("tools");
    expect(body.stream).toBe(true);
  });
});
