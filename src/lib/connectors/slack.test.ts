import { afterEach, describe, expect, test, vi } from "vitest";
import slack from "./slack";

afterEach(() => {
  vi.restoreAllMocks();
});

const CREDS = { access_token: "xoxb-test-token" };

// 20 fake channels/messages — để kiểm tra cap 15.
const manyChannels = Array.from({ length: 20 }, (_, i) => ({
  id: "C" + i,
  name: "kenh-" + i,
  is_private: i % 2 === 0,
  is_archived: false,
  num_members: i + 1,
  topic: { value: "bỏ qua" },
}));
const manyMessages = Array.from({ length: 20 }, (_, i) => ({
  type: "message",
  user: "U" + i,
  text: "tin nhắn " + i,
  ts: "170000000" + i + ".000100",
  extra: "bỏ qua",
}));

describe("slack connector", () => {
  test("định danh + tên 3 tool + kind + recipientField (workflowSafe VẮNG MẶT trên write)", () => {
    expect(slack.id).toBe("slack");
    expect(slack.auth.type).toBe("oauth");
    expect(slack.auth.provider).toBe("slack");
    expect(slack.tools.map((t) => t.function.name)).toEqual([
      "slack_list_channels",
      "slack_channel_history",
      "slack_send_message",
    ]);
    const toolOf = (name: string) => slack.tools.find((t) => t.function.name === name)!;
    expect(toolOf("slack_list_channels").kind).toBe("read");
    expect(toolOf("slack_channel_history").kind).toBe("read");
    const send = toolOf("slack_send_message");
    expect(send.kind).toBe("write");
    expect(send.recipientField).toBe("channel");
    // fail-closed: write tool KHÔNG được khai báo workflowSafe (kể cả false)
    expect("workflowSafe" in send).toBe(false);
  });

  test("slack_list_channels: đúng URL + Bearer + form params, kết quả cap 15", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json({ ok: true, channels: manyChannels }));
    const r = (await slack.handlers.slack_list_channels({ limit: 50 }, CREDS)) as {
      channels: { id: string; name: string; is_private: boolean; num_members: number }[];
    };
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/conversations.list");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer xoxb-test-token");
    const params = new URLSearchParams(String(init.body));
    expect(params.get("types")).toBe("public_channel,private_channel");
    expect(params.get("exclude_archived")).toBe("true");
    expect(params.get("limit")).toBe("15"); // user limit 50 bị cap về 15
    expect(r.channels).toHaveLength(15);
    expect(r.channels[0]).toEqual({ id: "C0", name: "kenh-0", is_private: true, num_members: 1 });
  });

  test("slack_channel_history: đúng URL + channel + cap 15, shape {user,text,ts}", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json({ ok: true, messages: manyMessages, has_more: true }));
    const r = (await slack.handlers.slack_channel_history({ channel: "C123ABC" }, CREDS)) as {
      messages: { user: string; text: string; ts: string }[];
    };
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/conversations.history");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer xoxb-test-token");
    const params = new URLSearchParams(String(init.body));
    expect(params.get("channel")).toBe("C123ABC");
    expect(params.get("limit")).toBe("15");
    expect(r.messages).toHaveLength(15);
    expect(r.messages[0]).toEqual({ user: "U0", text: "tin nhắn 0", ts: "1700000000.000100" });
  });

  test("slack_send_message: POST JSON chat.postMessage với channel+text, trả {ok,channel,ts}", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json({ ok: true, channel: "C123ABC", ts: "1503435956.000247" }));
    const r = await slack.handlers.slack_send_message(
      { channel: "C123ABC", text: "xin chào" },
      CREDS,
    );
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer xoxb-test-token");
    expect((init.headers as Record<string, string>)["Content-Type"]).toContain("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ channel: "C123ABC", text: "xin chào" });
    expect(r).toEqual({ ok: true, channel: "C123ABC", ts: "1503435956.000247" });
  });

  test("ok:false với lỗi thường → Error mang đúng mã lỗi của Slack", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ ok: false, error: "not_in_channel" }),
    );
    await expect(slack.handlers.slack_channel_history({ channel: "C1" }, CREDS)).rejects.toThrow(
      "not_in_channel",
    );
  });

  test("token_revoked → OAuthError với invalidGrant=true", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ ok: false, error: "token_revoked" }),
    );
    await expect(slack.handlers.slack_list_channels({}, CREDS)).rejects.toMatchObject({
      name: "OAuthError",
      invalidGrant: true,
      message: "token_revoked",
    });
  });

  test("invalid_auth trong test() cũng → OAuthError invalidGrant=true", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ ok: false, error: "invalid_auth" }));
    await expect(slack.test!(CREDS)).rejects.toMatchObject({
      name: "OAuthError",
      invalidGrant: true,
      message: "invalid_auth",
    });
  });

  test("test(): gọi auth.test và trả info chứa tên team", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json({ ok: true, team: "Acme Corp", user: "laam_bot" }));
    const r = await slack.test!(CREDS);
    expect(spy.mock.calls[0][0]).toBe("https://slack.com/api/auth.test");
    expect(r.ok).toBe(true);
    expect(r.info).toBe("Đã kết nối Slack: Acme Corp");
  });

  test("thiếu access_token → báo lỗi rõ ràng, không gọi fetch", async () => {
    const spy = vi.spyOn(global, "fetch");
    await expect(slack.handlers.slack_list_channels({}, {})).rejects.toThrow(
      /thiếu Slack access token/,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
