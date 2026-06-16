import { afterEach, describe, expect, test, vi } from "vitest";
import whatsapp from "./whatsapp";

afterEach(() => {
  vi.restoreAllMocks();
});

const CREDS = { access_token: "EAAGtoktest", phone_number_id: "106540352242922" };

describe("whatsapp connector", () => {
  test("định danh: 1 tool write, recipientField 'to' + recipientFormat e164, workflowSafe=true (gated 2026-06-16)", () => {
    expect(whatsapp.id).toBe("whatsapp");
    expect(whatsapp.auth.type).toBe("token");
    expect(whatsapp.tools).toHaveLength(1);
    const t = whatsapp.tools[0];
    expect(t.function.name).toBe("whatsapp_send_message");
    expect(t.kind).toBe("write");
    // Gate đích đến (exfil): trường "to" phải được khai báo là recipientField + format E.164.
    expect(t.recipientField).toBe("to");
    expect(t.recipientFormat).toBe("e164");
    // 2026-06-16: flipped workflowSafe — gated by the per-format WhatsApp (E.164) allowlist,
    // fail-closed when WORKFLOW_WHATSAPP_ALLOWLIST unset.
    expect(t.workflowSafe).toBe(true);
  });

  test("send_message POST đúng body Cloud API + Bearer header + URL có phone_number_id", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        messaging_product: "whatsapp",
        contacts: [{ input: "84912345678", wa_id: "84912345678" }],
        messages: [{ id: "wamid.ABC123", message_status: "accepted" }],
      }),
    );
    const r = (await whatsapp.handlers.whatsapp_send_message(
      { to: "84912345678", text: "Xin chào" },
      CREDS,
    )) as { ok: boolean; message_id: string };
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v25.0/106540352242922/messages");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer EAAGtoktest");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "84912345678",
      type: "text",
      text: { preview_url: false, body: "Xin chào" },
    });
    expect(r).toEqual({ ok: true, message_id: "wamid.ABC123" });
  });

  test("chuẩn hoá 'to': bỏ dấu + và khoảng trắng, chỉ giữ chữ số", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json({ messages: [{ id: "wamid.X" }] }));
    await whatsapp.handlers.whatsapp_send_message({ to: "+84 912 345 678", text: "hi" }, CREDS);
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).to).toBe("84912345678");
  });

  test("ngoài cửa sổ 24h: Graph error {error:{message,code}} → Error chứa message + code", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json(
        {
          error: {
            message: "Re-engagement message",
            type: "OAuthException",
            code: 131047,
          },
        },
        { status: 400 },
      ),
    );
    await expect(
      whatsapp.handlers.whatsapp_send_message({ to: "84912345678", text: "hi" }, CREDS),
    ).rejects.toThrow("Re-engagement message (code 131047)");
  });

  test("test() gọi đúng endpoint và trả info 'Đã kết nối WhatsApp: tên (số)'", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        display_phone_number: "+84 90 123 4567",
        verified_name: "LAAM Co",
        id: "106540352242922",
      }),
    );
    const r = await whatsapp.test!(CREDS);
    expect(spy.mock.calls[0][0]).toBe(
      "https://graph.facebook.com/v25.0/106540352242922?fields=display_phone_number,verified_name",
    );
    expect(r.ok).toBe(true);
    expect(r.info).toBe("Đã kết nối WhatsApp: LAAM Co (+84 90 123 4567)");
  });

  test("thiếu creds.phone_number_id → Error rõ ràng, không gọi mạng", async () => {
    const spy = vi.spyOn(global, "fetch");
    await expect(
      whatsapp.handlers.whatsapp_send_message(
        { to: "84912345678", text: "hi" },
        { access_token: "x" },
      ),
    ).rejects.toThrow(/Thiếu phone_number_id/);
    expect(spy).not.toHaveBeenCalled();
  });
});
