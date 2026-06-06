// Google Drive connector — in-app OAuth (see google-oauth.ts). The user clicks
// "Kết nối với Google"; LAAM stores the refresh token (encrypted) and refreshes the
// access token automatically. The gapi() wrapper reads creds.access_token, which
// execute() keeps fresh before each call.
import type { Connector } from "./types";

const API = "https://www.googleapis.com";

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
    ...(init.headers as Record<string, string> | undefined),
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

// Like gapi() but returns the RAW text body (gapi parses JSON). Used for the
// Drive export endpoint, which streams the file contents as plain text.
async function gapiText(pathname: string, creds: Record<string, string>): Promise<string> {
  if (!creds || !creds.access_token) throw new Error("thiếu Google access token");
  const headers = {
    Authorization: "Bearer " + creds.access_token,
    "User-Agent": "LAAM-connector/0.1",
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + pathname, { headers, signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
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
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
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
    {
      type: "function",
      kind: "read",
      function: {
        name: "gdrive_get_file",
        description: "Lấy thông tin chi tiết của một tệp trên Google Drive theo ID.",
        parameters: {
          type: "object",
          properties: { fileId: { type: "string", description: "ID của tệp cần lấy" } },
          required: ["fileId"],
        },
      },
    },
    {
      type: "function",
      kind: "read",
      function: {
        name: "gdrive_export_text",
        description: "Xuất nội dung của tệp Google (Tài liệu/Trang tính) dưới dạng văn bản thuần.",
        parameters: {
          type: "object",
          properties: { fileId: { type: "string", description: "ID của tệp cần xuất" } },
          required: ["fileId"],
        },
      },
    },
    {
      type: "function",
      kind: "write",
      function: {
        name: "gdrive_create_folder",
        description: "Tạo một thư mục mới trên Google Drive (tuỳ chọn đặt trong thư mục cha).",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "tên thư mục" },
            parentId: { type: "string", description: "ID thư mục cha (tuỳ chọn)" },
          },
          required: ["name"],
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
    async gdrive_get_file(args, creds) {
      const id = encodeURIComponent(String(args.fileId || ""));
      const data = (await gapi(
        "/drive/v3/files/" + id + "?fields=id,name,mimeType,modifiedTime,webViewLink,size",
        creds,
      )) as Record<string, unknown>;
      return { file: file(data), size: data.size || null };
    },
    async gdrive_export_text(args, creds) {
      const id = encodeURIComponent(String(args.fileId || ""));
      const text = await gapiText(
        "/drive/v3/files/" + id + "/export?mimeType=" + encodeURIComponent("text/plain"),
        creds,
      );
      return { text: text.slice(0, 8000) };
    },
    async gdrive_create_folder(args, creds) {
      const parentId = args.parentId ? String(args.parentId) : undefined;
      const data = (await gapi("/drive/v3/files?fields=id,name,webViewLink", creds, {
        method: "POST",
        body: JSON.stringify({
          name: String(args.name || ""),
          mimeType: "application/vnd.google-apps.folder",
          parents: parentId ? [parentId] : undefined,
        }),
        headers: { "Content-Type": "application/json" },
      })) as Record<string, unknown>;
      return {
        folder: {
          id: data.id,
          name: data.name,
          url: data.webViewLink || "https://drive.google.com/drive/folders/" + data.id,
        },
      };
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
