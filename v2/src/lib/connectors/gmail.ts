// Gmail connector — pragmatic OAuth scaffold.
// The user pastes a Google OAuth2 access token (a real in-app OAuth flow is coming).
// Token comes ONLY from creds.access_token; nothing is hard-coded.
import type { Connector } from "./types";

const API = "https://gmail.googleapis.com";

async function gapi(pathname: string, creds: Record<string, string>): Promise<unknown> {
  if (!creds || !creds.access_token) throw new Error("thiếu Google access token");
  const headers = {
    Authorization: "Bearer " + creds.access_token,
    Accept: "application/json",
    "User-Agent": "LAAM-connector/0.1",
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + pathname, { headers, signal: ctrl.signal });
    const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!r.ok) throw new Error((body && body.error && (body.error.message || "error")) || "HTTP " + r.status);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

type GmailPayload = { headers?: { name?: string; value?: string }[] };

function header(payload: GmailPayload | undefined, name: string): string | null {
  const hs = (payload && payload.headers) || [];
  const h = hs.find((x) => x.name && x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value || null : null;
}

// Fetch metadata for a small set of message ids and shape compact objects.
async function expand(ids: { id: string }[], creds: Record<string, string>) {
  const out = [];
  for (const m of ids.slice(0, 10)) {
    try {
      const msg = (await gapi(
        "/gmail/v1/users/me/messages/" +
          encodeURIComponent(m.id) +
          "?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date",
        creds,
      )) as { id: string; payload?: GmailPayload; snippet?: string };
      out.push({
        id: msg.id,
        subject: header(msg.payload, "Subject") || "(không tiêu đề)",
        from: header(msg.payload, "From"),
        date: header(msg.payload, "Date"),
        snippet: msg.snippet || "",
      });
    } catch {
      /* fail-soft: skip messages that error */
    }
  }
  return out;
}

const gmail: Connector = {
  id: "gmail",
  name: "Gmail",
  icon: "message-square",
  blurb: "Đọc và tìm email trong Gmail",
  auth: {
    type: "token",
    help: 'Cần một Google OAuth access token (KHÔNG phải mật khẩu). Lấy nhanh tại OAuth 2.0 Playground: developers.google.com/oauthplayground — chọn scope "https://www.googleapis.com/auth/gmail.readonly", bấm "Authorize APIs", rồi "Exchange authorization code for tokens" và sao chép Access token. Dán vào đây (token sẽ hết hạn sau ~1 giờ). LAAM sẽ KHÔNG đăng nhập thay bạn; luồng OAuth tích hợp trong ứng dụng sẽ có sau.',
    fields: [{ key: "access_token", label: "Google OAuth access token", placeholder: "ya29.…", secret: true }],
  },
  tools: [
    {
      type: "function",
      function: {
        name: "gmail_list_messages",
        description: "Liệt kê các email gần đây trong hộp thư Gmail của người dùng.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "gmail_search",
        description:
          "Tìm email trong Gmail theo cú pháp tìm kiếm của Gmail (ví dụ: from:abc, is:unread, subject:hoá đơn).",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "truy vấn tìm kiếm Gmail" } },
          required: ["query"],
        },
      },
    },
  ],
  handlers: {
    async gmail_list_messages(_args, creds) {
      const data = (await gapi("/gmail/v1/users/me/messages?maxResults=10", creds)) as {
        messages?: { id: string }[];
      };
      return { messages: await expand(data.messages || [], creds) };
    },
    async gmail_search(args, creds) {
      const data = (await gapi(
        "/gmail/v1/users/me/messages?maxResults=10&q=" + encodeURIComponent(String(args.query || "")),
        creds,
      )) as { messages?: { id: string }[] };
      return { messages: await expand(data.messages || [], creds) };
    },
  },
  async test(creds) {
    const me = (await gapi("/gmail/v1/users/me/profile", creds)) as { emailAddress?: string };
    return { ok: true, info: "Đã kết nối Gmail: " + ((me && me.emailAddress) || "OK") };
  },
};

export default gmail;
