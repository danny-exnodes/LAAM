// Google Drive connector — pragmatic OAuth scaffold.
// The user pastes a Google OAuth2 access token (a real in-app OAuth flow is coming).
// Token comes ONLY from creds.access_token; nothing is hard-coded.
const API = 'https://www.googleapis.com';

async function gapi(pathname, creds) {
  if (!creds || !creds.access_token) throw new Error('thiếu Google access token');
  const headers = { 'Authorization': 'Bearer ' + creds.access_token, 'Accept': 'application/json' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(API + pathname, { headers, signal: ctrl.signal });
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error((body && body.error && (body.error.message || body.error)) || ('HTTP ' + r.status));
    return body;
  } finally { clearTimeout(timer); }
}

const file = (f) => ({ id: f.id, name: f.name, type: f.mimeType, modified: f.modifiedTime, url: f.webViewLink });
const FIELDS = 'files(id,name,mimeType,modifiedTime,webViewLink)';

export default {
  id: 'google-drive',
  name: 'Google Drive',
  icon: 'folder',
  blurb: 'Tệp và thư mục trên Google Drive',
  auth: {
    type: 'token',
    help: 'Cần một Google OAuth access token (KHÔNG phải mật khẩu). Lấy nhanh tại OAuth 2.0 Playground: developers.google.com/oauthplayground — chọn scope "https://www.googleapis.com/auth/drive.readonly", bấm "Authorize APIs", rồi "Exchange authorization code for tokens" và sao chép Access token. Dán vào đây (token sẽ hết hạn sau ~1 giờ). LAAM sẽ KHÔNG đăng nhập thay bạn; luồng OAuth tích hợp trong ứng dụng sẽ có sau.',
    fields: [{ key: 'access_token', label: 'Google OAuth access token', placeholder: 'ya29.…', secret: true }],
  },
  tools: [
    { type: 'function', function: { name: 'gdrive_list_files', description: 'Liệt kê các tệp gần đây trên Google Drive của người dùng.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'gdrive_search', description: 'Tìm tệp trên Google Drive theo tên.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'từ khoá tên tệp cần tìm' } }, required: ['query'] } } },
  ],
  handlers: {
    async gdrive_list_files(args, creds) {
      const data = await gapi('/drive/v3/files?pageSize=15&fields=' + encodeURIComponent(FIELDS), creds);
      return { files: (data.files || []).slice(0, 15).map(file) };
    },
    async gdrive_search(args, creds) {
      const q = "name contains '" + String(args.query || '').replace(/'/g, "\\'") + "'";
      const data = await gapi('/drive/v3/files?pageSize=15&q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent(FIELDS), creds);
      return { files: (data.files || []).slice(0, 15).map(file) };
    },
  },
  async test(creds) {
    const me = await gapi('/drive/v3/about?fields=user', creds);
    const u = (me && me.user) || {};
    return { ok: true, info: 'Đã kết nối Google Drive: ' + (u.emailAddress || u.displayName || 'OK') };
  },
};
