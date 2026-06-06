// Google Drive connector — in-app OAuth (see google-oauth.ts). The user clicks
// "Kết nối với Google"; LAAM stores the refresh token (encrypted) and refreshes the
// access token automatically. The gapi() wrapper reads creds.access_token, which
// execute() keeps fresh before each call.
import type { Connector } from "./types";

const API = "https://www.googleapis.com";

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

const file = (f: Record<string, unknown>) => ({
  id: f.id,
  name: f.name,
  type: f.mimeType,
  modified: f.modifiedTime,
  url: f.webViewLink,
});
const FIELDS = "files(id,name,mimeType,modifiedTime,webViewLink)";

const googleDrive: Connector = {
  id: "google-drive",
  name: "Google Drive",
  icon: "folder",
  blurb: "Tệp và thư mục trên Google Drive",
  auth: {
    type: "oauth",
    provider: "google",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/drive.readonly"],
    setup:
      'Bấm "Kết nối với Google" để cấp quyền đọc Google Drive (chỉ đọc). LAAM lưu token phía máy chủ, mã hoá tại chỗ; phiên có thể cần kết nối lại sau ~7 ngày (giới hạn của Google ở chế độ thử nghiệm).',
  },
  tools: [
    {
      type: "function",
      kind: "read",
      function: {
        name: "gdrive_list_files",
        description: "Liệt kê các tệp gần đây trên Google Drive của người dùng.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "gdrive_search",
        description: "Tìm tệp trên Google Drive theo tên.",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "từ khoá tên tệp cần tìm" } },
          required: ["query"],
        },
      },
    },
  ],
  handlers: {
    async gdrive_list_files(_args, creds) {
      const data = (await gapi("/drive/v3/files?pageSize=15&fields=" + encodeURIComponent(FIELDS), creds)) as {
        files?: Record<string, unknown>[];
      };
      return { files: (data.files || []).slice(0, 15).map(file) };
    },
    async gdrive_search(args, creds) {
      const q = "name contains '" + String(args.query || "").replace(/'/g, "\\'") + "'";
      const data = (await gapi(
        "/drive/v3/files?pageSize=15&q=" + encodeURIComponent(q) + "&fields=" + encodeURIComponent(FIELDS),
        creds,
      )) as { files?: Record<string, unknown>[] };
      return { files: (data.files || []).slice(0, 15).map(file) };
    },
  },
  async test(creds) {
    const me = (await gapi("/drive/v3/about?fields=user", creds)) as {
      user?: { emailAddress?: string; displayName?: string };
    };
    const u = (me && me.user) || {};
    return { ok: true, info: "Đã kết nối Google Drive: " + (u.emailAddress || u.displayName || "OK") };
  },
};

export default googleDrive;
