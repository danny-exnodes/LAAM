// WhatsApp connector — WhatsApp Business Platform (Cloud API) trên Meta Graph API.
// SEND-ONLY: nhận tin inbound đòi hỏi webhook HTTPS công khai (không khả thi trên
// deployment Tailscale-only). Token-paste only: Embedded Signup của Meta cần Tech
// Provider verification + App Review — không có redirect-OAuth thực dụng cho tool
// self-hosted nhỏ.
import type { Connector } from "./types";

// Pin phiên bản Graph API ở MỘT chỗ (Meta deprecate version theo chu kỳ ~2 năm).
const GRAPH = "https://graph.facebook.com/v25.0";

async function graph(
  pathname: string,
  creds: Record<string, string>,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {};
  if (creds && creds.access_token) headers["Authorization"] = "Bearer " + creds.access_token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(GRAPH + pathname, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      signal: ctrl.signal,
    });
    const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (!r.ok) {
      // Graph error shape: { error: { message, code } } — chỉ đưa message của API
      // ra ngoài (không bao giờ echo token/header/request init).
      const err = (body && (body.error as { message?: string; code?: number })) || null;
      const msg = (err && err.message) || "HTTP " + r.status;
      throw new Error(err && err.code ? msg + " (code " + err.code + ")" : msg);
    }
    return body || {};
  } finally {
    clearTimeout(timer);
  }
}

function phoneNumberId(creds: Record<string, string>): string {
  if (!creds || !creds.phone_number_id) {
    throw new Error(
      "Thiếu phone_number_id — nhập Phone Number ID (App Dashboard → WhatsApp → API Setup) trong cấu hình kết nối WhatsApp.",
    );
  }
  return encodeURIComponent(creds.phone_number_id);
}

const whatsapp: Connector = {
  id: "whatsapp",
  name: "WhatsApp",
  icon: "message-square",
  blurb: "Gửi tin WhatsApp qua Cloud API (chỉ gửi, trong cửa sổ 24h)",
  auth: {
    type: "token",
    help:
      "Cần WhatsApp BUSINESS Platform — KHÔNG dùng được tài khoản WhatsApp cá nhân. " +
      "Tạo Meta app loại Business tại developers.facebook.com, thêm product WhatsApp. " +
      "Access token: tạo System User token vĩnh viễn trong business.facebook.com → Business Settings → System Users " +
      "(gán quyền cả App lẫn WABA, chọn whatsapp_business_messaging + whatsapp_business_management, expiration: Never). " +
      "Phone number ID lấy ở App Dashboard → WhatsApp → API Setup (là ID, không phải số điện thoại). " +
      "Token tạm 24h ở API Setup chỉ dùng để thử.",
    fields: [
      { key: "access_token", label: "Access Token (System User)", secret: true },
      { key: "phone_number_id", label: "Phone Number ID", placeholder: "1065…" },
    ],
  },
  tools: [
    {
      type: "function",
      kind: "write",
      workflowSafe: true, // CTO-cleared 2026-06-16: gated by per-format WhatsApp E.164 allowlist (WORKFLOW_WHATSAPP_ALLOWLIST), fail-closed by default — see workflow/recipient.ts
      recipientField: "to",
      recipientFormat: "e164",
      function: {
        name: "whatsapp_send_message",
        description:
          "Gửi tin nhắn văn bản WhatsApp tới một số điện thoại qua Cloud API. " +
          '"to" là số điện thoại quốc tế không có dấu +, chỉ gồm chữ số (vd 84912345678). ' +
          "LƯU Ý: chỉ gửi được tin văn bản tự do trong vòng 24 giờ kể từ tin nhắn gần nhất NGƯỜI NHẬN gửi tới số business " +
          "(ngoài cửa sổ này Meta từ chối — lỗi 131047 — phải dùng template đã duyệt, LAAM chưa hỗ trợ).",
        parameters: {
          type: "object",
          properties: {
            to: {
              type: "string",
              description: "số điện thoại người nhận dạng quốc tế, chỉ chữ số, không có dấu + (vd 84912345678)",
            },
            text: { type: "string", description: "nội dung tin nhắn văn bản" },
          },
          required: ["to", "text"],
        },
      },
    },
  ],
  handlers: {
    async whatsapp_send_message(args, creds) {
      const id = phoneNumberId(creds);
      const data = await graph(`/${id}/messages`, creds, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          // Chuẩn hoá về dạng chỉ-chữ-số mà Cloud API yêu cầu (bỏ "+", khoảng trắng…).
          to: String(args.to || "").replace(/\D/g, ""),
          type: "text",
          text: { preview_url: false, body: String(args.text || "") },
        }),
      });
      const messages = data.messages as { id?: string }[] | undefined;
      return { ok: true, message_id: messages && messages[0] ? messages[0].id : undefined };
    },
  },
  async test(creds) {
    const id = phoneNumberId(creds);
    const info = (await graph(`/${id}?fields=display_phone_number,verified_name`, creds)) as {
      display_phone_number?: string;
      verified_name?: string;
    };
    return {
      ok: true,
      info: "Đã kết nối WhatsApp: " + info.verified_name + " (" + info.display_phone_number + ")",
    };
  },
};

export default whatsapp;
