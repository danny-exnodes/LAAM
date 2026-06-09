// Gmail connector — in-app OAuth (see google-oauth.ts). The user clicks "Kết nối
// với Google"; LAAM stores the refresh token (encrypted) and refreshes the access
// token automatically. The gapi() wrapper reads creds.access_token, which execute()
// keeps fresh before each call.
import type { Connector } from "./types";
import { parseRecipients } from "./recipients";

const API = "https://gmail.googleapis.com";

async function gapi(
  pathname: string,
  creds: Record<string, string>,
  init: RequestInit = {},
): Promise<unknown> {
  if (!creds || !creds.access_token) throw new Error("thiếu Google access token");
  const headers = {
    Authorization: "Bearer " + creds.access_token,
    Accept: "application/json",
    "User-Agent": "LAAM-connector/0.1",
    // caller-supplied headers (e.g. Content-Type for POST) merge on top
    ...((init.headers as Record<string, string>) || {}),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + pathname, { ...init, headers, signal: ctrl.signal });
    const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!r.ok) throw new Error((body && body.error && (body.error.message || "error")) || "HTTP " + r.status);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};
type GmailPayload = {
  headers?: { name?: string; value?: string }[];
} & GmailPart;

function header(payload: GmailPayload | undefined, name: string): string | null {
  const hs = (payload && payload.headers) || [];
  const h = hs.find((x) => x.name && x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value || null : null;
}

// Recursively find the first text/plain part and decode its base64url body.
// Gmail nests parts (multipart/alternative inside multipart/mixed, etc.).
function plainText(part: GmailPart | undefined): string | null {
  if (!part) return null;
  if (part.mimeType === "text/plain" && part.body && part.body.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const child of part.parts || []) {
    const found = plainText(child);
    if (found != null) return found;
  }
  return null;
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
    type: "oauth",
    provider: "google",
    // gmail.send is a SENSITIVE send scope (Google restricted/sensitive) — it lets
    // LAAM send mail on the user's behalf; granted only after explicit re-consent.
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    setup:
      'Bấm "Kết nối với Google" để cấp quyền đọc Gmail (chỉ đọc). LAAM lưu token phía máy chủ, mã hoá tại chỗ; phiên có thể cần kết nối lại sau ~7 ngày (giới hạn của Google ở chế độ thử nghiệm).',
  },
  tools: [
    {
      type: "function",
      kind: "read",
      function: {
        name: "gmail_list_messages",
        description: "Liệt kê các email gần đây trong hộp thư Gmail của người dùng.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      kind: "read",
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
    {
      type: "function",
      kind: "read",
      function: {
        name: "gmail_get_message",
        description:
          "Đọc nội dung đầy đủ của một email Gmail theo id (tiêu đề, người gửi/nhận, ngày và nội dung văn bản).",
        parameters: {
          type: "object",
          properties: { id: { type: "string", description: "id của email cần đọc" } },
          required: ["id"],
        },
      },
    },
    {
      type: "function",
      kind: "write",
      recipientField: "to", // outbound destination → workflow recipient-gate enforces allowlist
      function: {
        name: "gmail_send",
        description:
          "Gửi một email mới từ tài khoản Gmail của người dùng (nhập người nhận, tiêu đề và nội dung).",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "địa chỉ email người nhận" },
            subject: { type: "string", description: "tiêu đề email" },
            body: { type: "string", description: "nội dung email (văn bản thuần)" },
          },
          required: ["to", "subject", "body"],
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
    async gmail_get_message(args, creds) {
      const msg = (await gapi(
        "/gmail/v1/users/me/messages/" + encodeURIComponent(String(args.id || "")) + "?format=full",
        creds,
      )) as { id?: string; payload?: GmailPayload; snippet?: string };
      const payload = msg.payload;
      // Prefer a text/plain part; fall back to the top-level body, then the snippet.
      const text =
        plainText(payload) ||
        (payload && payload.body && payload.body.data
          ? Buffer.from(payload.body.data, "base64url").toString("utf8")
          : null) ||
        msg.snippet ||
        "";
      return {
        id: msg.id,
        subject: header(payload, "Subject"),
        from: header(payload, "From"),
        to: header(payload, "To"),
        date: header(payload, "Date"),
        body: text.slice(0, 8000),
      };
    },
    async gmail_send(args, creds) {
      const to = String(args.to || "");
      const subject = String(args.subject || "");
      const body = String(args.body || "");
      // F1 (header fields): reject CRLF in `to`/`subject` — they sit in the header block, so a
      // newline is header injection. `body` is intentionally NOT checked: it is appended after
      // the \r\n\r\n separator below and is legitimately multi-line (digest). (spec §3.5, §10.)
      if (/[\r\n]/.test(to) || /[\r\n]/.test(subject)) {
        throw new Error("gmail_send: ký tự xuống dòng trong 'to'/'subject' (header injection)");
      }
      // F2: rebuild `To:` from the SHARED canonical parser → bare addresses only, identical to
      // what the workflow recipient-gate validated (zero differential). Throws on non-canonical
      // input (display-name, comment, multiple-@, CRLF).
      const toHeader = parseRecipients(to).join(", ");
      // RFC 2822 message; base64url-encoded as Gmail's `raw` field expects.
      const message =
        "To: " +
        toHeader +
        "\r\nSubject: " +
        subject +
        '\r\nContent-Type: text/plain; charset="UTF-8"\r\nMIME-Version: 1.0\r\n\r\n' +
        body;
      const raw = Buffer.from(message).toString("base64url");
      const data = (await gapi("/gmail/v1/users/me/messages/send", creds, {
        method: "POST",
        body: JSON.stringify({ raw }),
        headers: { "Content-Type": "application/json" },
      })) as { id?: string };
      return { ok: true, id: data.id };
    },
  },
  async test(creds) {
    const me = (await gapi("/gmail/v1/users/me/profile", creds)) as { emailAddress?: string };
    return { ok: true, info: "Đã kết nối Gmail: " + ((me && me.emailAddress) || "OK") };
  },
};

export default gmail;
