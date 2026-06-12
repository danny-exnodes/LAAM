// Slack connector — in-app OAuth (see oauth/slack.ts provider). The stored
// creds.access_token is the workspace's BOT token (xoxb, non-expiring with
// rotation off): per-WORKSPACE+app, not per-user — every LAAM user connecting
// the same workspace shares the same bot identity.
//
// Slack Web API convention: HTTP 200 with {ok:false, error:"..."} — ALWAYS
// branch on `ok`, never on HTTP status. Dead-grant errors (app uninstalled /
// token revoked) become OAuthError(invalidGrant=true) so the framework flips
// the connector to `needs_reconnect`.
import type { Connector } from "./types";
import { OAuthError } from "./oauth/types";

const API = "https://slack.com/api";

// auth.test / any-method errors that mean the grant is dead → reconnect.
const DEAD_GRANT = new Set(["token_revoked", "invalid_auth", "account_inactive", "token_expired"]);

// POST https://slack.com/api/<method>. Read-style methods take form-encoded
// params; chat.postMessage takes JSON (asJson=true). Error messages carry only
// Slack's error code — never the request init or token.
async function slackApi(
  method: string,
  creds: Record<string, string>,
  params: Record<string, string> = {},
  asJson = false,
): Promise<Record<string, unknown>> {
  if (!creds || !creds.access_token) throw new Error("thiếu Slack access token");
  const headers: Record<string, string> = {
    Authorization: "Bearer " + creds.access_token,
    "Content-Type": asJson ? "application/json; charset=utf-8" : "application/x-www-form-urlencoded",
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + "/" + method, {
      method: "POST",
      headers,
      body: asJson ? JSON.stringify(params) : new URLSearchParams(params).toString(),
      signal: ctrl.signal,
    });
    const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new Error("HTTP " + r.status);
    if (body.ok !== true) {
      const err = String(body.error || "HTTP " + r.status);
      if (DEAD_GRANT.has(err)) throw new OAuthError(err, true);
      throw new Error(err);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const slack: Connector = {
  id: "slack",
  name: "Slack",
  icon: "message-square",
  blurb: "Kênh, tin nhắn Slack của workspace (bot)",
  auth: {
    type: "oauth",
    provider: "slack",
    scopes: [
      "channels:read",
      "groups:read",
      "channels:history",
      "groups:history",
      "chat:write",
      "chat:write.public",
    ],
    help:
      "Bot token là CHUNG cho cả workspace: mọi người dùng LAAM kết nối cùng workspace sẽ dùng chung danh tính bot. Muốn bot ĐỌC lịch sử một kênh, phải mời bot vào kênh đó (/invite @LAAM); gửi tin vào kênh public thì không cần mời.",
    setup:
      "Tạo app tại api.slack.com/apps (From scratch) → OAuth & Permissions: thêm 6 bot scopes (channels:read, groups:read, channels:history, groups:history, chat:write, chat:write.public) và Redirect URL {OAUTH_PUBLIC_BASE_URL}/api/connectors/slack/callback → Basic Information: copy Client ID/Secret vào env SLACK_CLIENT_ID/SLACK_CLIENT_SECRET. KHÔNG bật Token Rotation / PKCE / Public Distribution.",
  },
  tools: [
    {
      type: "function",
      kind: "read",
      function: {
        name: "slack_list_channels",
        description:
          "Liệt kê các kênh Slack của workspace (public và private). Kênh private chỉ hiện khi bot đã được mời vào kênh. Trả về id kênh để dùng cho các công cụ Slack khác.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "số kênh tối đa, mặc định 15 (tối đa 15)" },
          },
        },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "slack_channel_history",
        description:
          "Đọc các tin nhắn gần đây của một kênh Slack (mới nhất trước). Bot phải là thành viên của kênh; nếu gặp lỗi not_in_channel hãy bảo người dùng mời bot vào kênh (/invite @LAAM). channel là ID kênh (dạng C…), lấy từ slack_list_channels.",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string", description: "ID kênh Slack (dạng C…)" },
            limit: { type: "number", description: "số tin nhắn tối đa, mặc định 15 (tối đa 15)" },
          },
          required: ["channel"],
        },
      },
    },
    {
      type: "function",
      kind: "write",
      recipientField: "channel", // outbound destination → workflow recipient-gate enforces allowlist
      function: {
        name: "slack_send_message",
        description:
          "Gửi một tin nhắn vào kênh Slack. Gọi khi người dùng yêu cầu gửi/đăng tin nhắn Slack. channel là ID kênh (KHÔNG phải tên) — lấy bằng slack_list_channels.",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string", description: "ID kênh Slack nhận tin (dạng C…)" },
            text: { type: "string", description: "nội dung tin nhắn" },
          },
          required: ["channel", "text"],
        },
      },
    },
  ],
  handlers: {
    async slack_list_channels(args, creds) {
      const limit = Math.min(Number(args.limit) || 15, 15);
      const data = await slackApi("conversations.list", creds, {
        types: "public_channel,private_channel",
        exclude_archived: "true",
        limit: String(limit),
      });
      const channels = (Array.isArray(data.channels) ? data.channels : []) as Record<
        string,
        unknown
      >[];
      return {
        channels: channels.slice(0, limit).map((c) => ({
          id: c.id,
          name: c.name,
          is_private: c.is_private,
          num_members: c.num_members,
        })),
      };
    },
    async slack_channel_history(args, creds) {
      const limit = Math.min(Number(args.limit) || 15, 15);
      const data = await slackApi("conversations.history", creds, {
        channel: String(args.channel || ""),
        limit: String(limit),
      });
      const messages = (Array.isArray(data.messages) ? data.messages : []) as Record<
        string,
        unknown
      >[];
      return {
        messages: messages.slice(0, limit).map((m) => ({ user: m.user, text: m.text, ts: m.ts })),
      };
    },
    async slack_send_message(args, creds) {
      const data = await slackApi(
        "chat.postMessage",
        creds,
        { channel: String(args.channel || ""), text: String(args.text || "") },
        true,
      );
      return { ok: true, channel: data.channel, ts: data.ts };
    },
  },
  async test(creds) {
    const data = await slackApi("auth.test", creds);
    return { ok: true, info: "Đã kết nối Slack: " + ((data.team as string) || "OK") };
  },
};

export default slack;
