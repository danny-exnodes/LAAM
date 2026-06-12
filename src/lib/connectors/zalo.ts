// Zalo OA connector — in-app OAuth (provider "zalo", see oauth/zalo.ts). NO manual
// token-paste fallback: a hand-pasted OA access token dies in ~25h, harmful.
// The consent is granted by an OA ADMIN for the WHOLE OA (one token per OA),
// not per end-user — the token represents the OA itself.
//
// ⚠️ Research confidence MEDIUM (2026-06-12): developers.zalo.me docs are a JS SPA;
// endpoints are ground-truthed from the official zaloplatform/zalo-php-sdk — cần
// runtime-verify khi operator có app (đặc biệt shape của query `data=` trên v2.0).
import type { Connector } from "./types";

const API = "https://openapi.zalo.me";

// Zalo Open API quirks:
// - auth header is the LITERAL header name `access_token` (NOT Authorization: Bearer);
// - errors often arrive as HTTP 200 with { error: <non-zero>, message } — check the
//   JSON `error` field on every response, not just HTTP status.
async function zapi(
  pathname: string,
  creds: Record<string, string>,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  if (!creds || !creds.access_token) throw new Error("thiếu Zalo OA access token");
  const headers = {
    access_token: creds.access_token,
    Accept: "application/json",
    "User-Agent": "LAAM-connector/0.1",
    // caller-supplied headers (e.g. Content-Type for POST) merge on top
    ...((init.headers as Record<string, string>) || {}),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + pathname, { ...init, headers, signal: ctrl.signal });
    const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && body.error !== undefined && Number(body.error) !== 0) {
      throw new Error(String(body.message || "lỗi Zalo") + " (Zalo error " + body.error + ")");
    }
    if (!r.ok) throw new Error((body && String(body.message)) || "HTTP " + r.status);
    return body || {};
  } finally {
    clearTimeout(timer);
  }
}

const zalo: Connector = {
  id: "zalo",
  name: "Zalo OA",
  icon: "message-square",
  blurb: "Tin nhắn Zalo Official Account (OA) — cần OA xác thực",
  auth: {
    type: "oauth",
    provider: "zalo",
    // Zalo không có scope — quyền đi theo liên kết app↔OA (all-or-nothing).
    scopes: [],
    help:
      "Người bấm Kết nối phải là ADMIN của OA. Consent cấp cho CẢ OA (một token đại diện OA, không phải từng người dùng) — team chỉ định MỘT admin kết nối; admin khác bấm kết nối lại có thể làm đứt kết nối của đồng nghiệp. OA phải được XÁC THỰC (giấy tờ doanh nghiệp) và API gửi tin cần gói trả phí (ví dụ gói Tăng trưởng).",
    setup:
      "Tạo app tại developers.zalo.me → sản phẩm Official Account: liên kết OA + kích hoạt API + đặt Callback URL {OAUTH_PUBLIC_BASE_URL}/api/connectors/zalo/callback → bật app Live → đặt env ZALO_APP_ID/ZALO_APP_SECRET. OAuth xác minh trên prod base.",
  },
  tools: [
    {
      type: "function",
      kind: "read",
      function: {
        name: "zalo_recent_chats",
        description:
          "Liệt kê các hội thoại gần đây của Zalo Official Account (OA); dùng để lấy user_id của người dùng trước khi gửi tin nhắn.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      kind: "write",
      // NO workflowSafe: fail-closed — chưa được duyệt chạy tự động trong workflow.
      recipientField: "user_id", // outbound destination → workflow recipient-gate enforces allowlist
      function: {
        name: "zalo_send_message",
        description:
          "Gửi tin nhắn tư vấn (CS) qua Zalo Official Account tới MỘT người dùng. CHỈ gửi được trong 48 giờ kể từ tương tác gần nhất của người dùng với OA (tối đa 8 tin miễn phí mỗi cửa sổ 48h). user_id là ID người dùng theo OA — lấy từ zalo_recent_chats, KHÔNG phải số điện thoại.",
        parameters: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "ID người nhận theo OA (lấy từ zalo_recent_chats)",
            },
            text: { type: "string", description: "nội dung tin nhắn văn bản" },
          },
          required: ["user_id", "text"],
        },
      },
    },
  ],
  handlers: {
    async zalo_recent_chats(_args, creds) {
      const body = await zapi(
        "/v2.0/oa/listrecentchat?data=" + encodeURIComponent(JSON.stringify({ offset: 0, count: 10 })),
        creds,
      );
      const rows = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
      return {
        chats: rows.slice(0, 10).map((c) => ({
          from_id: c.from_id,
          to_id: c.to_id,
          from_display_name: c.from_display_name,
          message: c.message,
          time: c.time,
        })),
      };
    },
    async zalo_send_message(args, creds) {
      const body = await zapi("/v3.0/oa/message/cs", creds, {
        method: "POST",
        body: JSON.stringify({
          recipient: { user_id: String(args.user_id || "") },
          message: { text: String(args.text || "") },
        }),
        headers: { "Content-Type": "application/json" },
      });
      const data = (body.data || {}) as { message_id?: string };
      return { ok: true, message_id: data.message_id };
    },
  },
  async test(creds) {
    const body = await zapi("/v2.0/oa/getoa", creds);
    const data = (body.data || {}) as { name?: string; num_follower?: number };
    return { ok: true, info: "Đã kết nối Zalo OA: " + (data.name || "OK") };
  },
};

export default zalo;
