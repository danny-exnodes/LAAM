import { afterEach, describe, expect, test, vi } from "vitest";
import zalo from "./zalo";

afterEach(() => {
  vi.restoreAllMocks();
});

const CREDS = { access_token: "oa-tok" };

describe("zalo connector", () => {
  test("identity + tool names", () => {
    expect(zalo.id).toBe("zalo");
    expect(zalo.auth.type).toBe("oauth");
    expect(zalo.auth.provider).toBe("zalo");
    // Zalo không có scope — quyền theo liên kết app↔OA
    expect(zalo.auth.scopes).toEqual([]);
    // KHÔNG có fields: token OA dán tay chết sau ~25h — chỉ OAuth
    expect(zalo.auth.fields).toBeUndefined();
    expect(zalo.tools.map((t) => t.function.name)).toEqual([
      "zalo_recent_chats",
      "zalo_send_message",
    ]);
  });

  test("kinds: recent_chats là read, send_message là write + recipientField user_id, workflowSafe VẮNG MẶT (fail-closed)", () => {
    const chats = zalo.tools.find((t) => t.function.name === "zalo_recent_chats")!;
    const send = zalo.tools.find((t) => t.function.name === "zalo_send_message")!;
    expect(chats.kind).toBe("read");
    expect(send.kind).toBe("write");
    expect(send.recipientField).toBe("user_id");
    // fail-closed: key phải VẮNG MẶT hoàn toàn, không phải false
    expect("workflowSafe" in send).toBe(false);
  });

  test("auth dùng header LITERAL access_token (không Bearer, không query param)", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ error: 0, data: [] }));
    await zalo.handlers.zalo_recent_chats({}, CREDS);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["access_token"]).toBe("oa-tok");
    expect(headers["Authorization"]).toBeUndefined();
    expect(String(url)).not.toContain("access_token=");
  });

  test("zalo_recent_chats gọi listrecentchat với data= là JSON URL-encoded và shape chats (cap 10)", async () => {
    const row = (i: number) => ({
      src: 1,
      type: "text",
      from_id: "u" + i,
      to_id: "oa1",
      from_display_name: "Khách " + i,
      message: "xin chào " + i,
      time: 1700000000000 + i,
    });
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ error: 0, message: "Success", data: Array.from({ length: 12 }, (_, i) => row(i)) }),
    );
    const r = (await zalo.handlers.zalo_recent_chats({}, CREDS)) as {
      chats: { from_id: string; to_id: string; from_display_name: string; message: string; time: number }[];
    };
    expect(spy.mock.calls[0][0]).toBe(
      "https://openapi.zalo.me/v2.0/oa/listrecentchat?data=" +
        encodeURIComponent('{"offset":0,"count":10}'),
    );
    expect(r.chats).toHaveLength(10);
    expect(r.chats[0]).toEqual({
      from_id: "u0",
      to_id: "oa1",
      from_display_name: "Khách 0",
      message: "xin chào 0",
      time: 1700000000000,
    });
    // extra fields (src/type) không lọt ra ngoài
    expect("src" in r.chats[0]).toBe(false);
  });

  test("HTTP 200 nhưng error khác 0 → throw message + mã lỗi Zalo", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ error: -201, message: "Invalid access token" }),
    );
    await expect(zalo.handlers.zalo_recent_chats({}, CREDS)).rejects.toThrow(
      "Invalid access token (Zalo error -201)",
    );
  });

  test("zalo_send_message POST body {recipient:{user_id}, message:{text}} và trả message_id", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ error: 0, message: "Success", data: { message_id: "msg_99" } }),
    );
    const r = (await zalo.handlers.zalo_send_message({ user_id: "u42", text: "Chào anh" }, CREDS)) as {
      ok: boolean;
      message_id: string;
    };
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openapi.zalo.me/v3.0/oa/message/cs");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      recipient: { user_id: "u42" },
      message: { text: "Chào anh" },
    });
    expect(r).toEqual({ ok: true, message_id: "msg_99" });
  });

  test("thiếu access_token → throw, không fetch", async () => {
    const spy = vi.spyOn(global, "fetch");
    await expect(zalo.handlers.zalo_send_message({ user_id: "u1", text: "hi" }, {})).rejects.toThrow(
      /thiếu Zalo OA access token/,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  test("test() gọi getoa và trả tên OA", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ error: 0, message: "Success", data: { name: "LAAM Shop", num_follower: 1234 } }),
    );
    const r = await zalo.test!(CREDS);
    expect(spy.mock.calls[0][0]).toBe("https://openapi.zalo.me/v2.0/oa/getoa");
    expect(r.ok).toBe(true);
    expect(r.info).toBe("Đã kết nối Zalo OA: LAAM Shop");
  });
});
