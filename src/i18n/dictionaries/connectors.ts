// Connectors page strings — ported from public/i18n.connectors.js (conn.* ns).
// NOTE: these conn.* keys are the connectors-PAGE namespace; they are distinct
// from the conn.connecting/live/lost connection-status keys in `common`.
// Each dict is consumed via its own useT(namespace), so the shared prefix never
// collides. Wave 4 (Connectors page) must use `connectors`, not `common`.
import type { Dict } from '../types';

export const connectors: Dict = {
  'conn.title': { vi: 'Kết nối — LAAM', en: 'Connectors — LAAM', zh: '连接器 — LAAM' },
  'conn.heading': { vi: 'Kết nối ứng dụng', en: 'App connectors', zh: '应用连接器' },
  'conn.sub': {
    vi: 'Kết nối các dịch vụ bạn dùng để trợ lý gọi được dữ liệu thật qua trò chuyện. Token bạn nhập chỉ lưu trên máy chủ của bạn, không gửi đi đâu khác.',
    en: 'Connect the services you use so the assistant can pull real data through chat. Tokens you enter are stored only on your server and sent nowhere else.',
    zh: '连接你常用的服务，助手即可通过对话获取真实数据。你输入的令牌仅保存在你的服务器上，不会发送到其他地方。',
  },
  'conn.connected': { vi: 'Đã kết nối', en: 'Connected', zh: '已连接' },
  'conn.notConnected': { vi: 'Chưa kết nối', en: 'Not connected', zh: '未连接' },
  'conn.toolsLabel': { vi: 'Công cụ', en: 'Tools', zh: '工具' },
  'conn.connect': { vi: 'Kết nối', en: 'Connect', zh: '连接' },
  'conn.enable': { vi: 'Bật', en: 'Enable', zh: '启用' },
  'conn.disconnect': { vi: 'Ngắt', en: 'Disconnect', zh: '断开' },
  'conn.test': { vi: 'Kiểm tra', en: 'Test', zh: '测试' },
  'conn.saving': { vi: 'Đang lưu…', en: 'Saving…', zh: '保存中…' },
  'conn.testing': { vi: 'Đang kiểm tra…', en: 'Testing…', zh: '测试中…' },
  'conn.testOk': { vi: 'Kết nối OK', en: 'Connection OK', zh: '连接正常' },
  'conn.testErr': { vi: 'Kiểm tra thất bại', en: 'Test failed', zh: '测试失败' },
  'conn.saveErr': { vi: 'Không lưu được credential', en: 'Could not save credentials', zh: '无法保存凭据' },
  'conn.loadErr': { vi: 'Không tải được danh sách kết nối.', en: 'Could not load connectors.', zh: '无法加载连接器。' },
  'conn.oauthNeeded': { vi: 'Cần OAuth — sắp có', en: 'OAuth needed — coming soon', zh: '需要 OAuth — 即将推出' },
  'conn.connectGoogle': { vi: 'Kết nối với Google', en: 'Connect with Google', zh: '使用 Google 连接' },
  'conn.reconnect': { vi: 'Kết nối lại', en: 'Reconnect', zh: '重新连接' },
  'conn.needsReconnect': { vi: 'Phiên hết hạn', en: 'Session expired', zh: '会话已过期' },
  'conn.account': { vi: 'Tài khoản', en: 'Account', zh: '账户' },
  'conn.connectedOk': { vi: 'Đã kết nối thành công.', en: 'Connected successfully.', zh: '连接成功。' },
  'conn.errNotConfigured': {
    vi: 'OAuth Google chưa được cấu hình trên máy chủ.',
    en: 'Google OAuth is not configured on the server.',
    zh: '服务器未配置 Google OAuth。',
  },
  'conn.errDenied': { vi: 'Bạn đã từ chối cấp quyền.', en: 'You declined the permission.', zh: '你拒绝了授权。' },
  'conn.errState': { vi: 'Phiên kết nối không hợp lệ, thử lại.', en: 'Invalid session, please retry.', zh: '会话无效，请重试。' },
  'conn.errExpired': { vi: 'Liên kết đã hết hạn, thử lại.', en: 'The link expired, please retry.', zh: '链接已过期，请重试。' },
  'conn.errExchange': {
    vi: 'Không đổi được mã với Google, thử lại.',
    en: 'Could not exchange the code with Google, please retry.',
    zh: '无法与 Google 交换代码，请重试。',
  },

  // Per-connector strings supplied by the connector modules (blurb / token help /
  // oauth setup). vi = the EXACT string from src/lib/connectors/<id>.ts so
  // Vietnamese users see no change; en/zh are translations. Keyed by connector id;
  // ConnectorsClient falls back to the connector-provided string if a key is absent.
  'conn.svc.demo.blurb': {
    vi: 'Connector mẫu để thử tool-calling — không cần credential',
    en: 'Sample connector for trying tool-calling — no credentials needed',
    zh: '用于试用工具调用的示例连接器 — 无需凭据',
  },
  'conn.svc.demo.help': {
    vi: 'Connector demo dùng dữ liệu mẫu cố định để minh hoạ luồng tool-calling.',
    en: 'The demo connector uses fixed sample data to illustrate the tool-calling flow.',
    zh: '演示连接器使用固定的示例数据来展示工具调用流程。',
  },
  'conn.svc.github.blurb': {
    vi: 'Repos, issues, pull requests',
    en: 'Repos, issues, pull requests',
    zh: '仓库、议题、拉取请求',
  },
  'conn.svc.github.help': {
    vi: 'Tạo Personal Access Token tại github.com/settings/tokens (scope: repo). Dán vào đây — LAAM lưu phía máy chủ, không gửi đi đâu khác.',
    en: 'Create a Personal Access Token at github.com/settings/tokens (scope: repo). Paste it here — LAAM stores it server-side and sends it nowhere else.',
    zh: '在 github.com/settings/tokens 创建个人访问令牌（scope: repo）。粘贴到这里 — LAAM 仅保存在服务器端，不会发送到其他地方。',
  },
  'conn.svc.trello.blurb': {
    vi: 'Boards, lists, cards',
    en: 'Boards, lists, cards',
    zh: '看板、列表、卡片',
  },
  'conn.svc.trello.help': {
    vi: 'Lấy API Key tại trello.com/app-key. Trên cùng trang đó, bấm "Token" để tạo một token. Dán cả hai vào đây — LAAM lưu phía máy chủ, không gửi đi đâu khác.',
    en: 'Get an API Key at trello.com/app-key. On the same page, click "Token" to generate a token. Paste both here — LAAM stores them server-side and sends them nowhere else.',
    zh: '在 trello.com/app-key 获取 API Key。在同一页面上，点击 "Token" 生成一个令牌。将两者都粘贴到这里 — LAAM 仅保存在服务器端，不会发送到其他地方。',
  },
  'conn.svc.jira.blurb': {
    vi: 'Issues, tasks, sprints trên Jira Cloud',
    en: 'Issues, tasks, sprints on Jira Cloud',
    zh: 'Jira Cloud 上的议题、任务、冲刺',
  },
  'conn.svc.jira.help': {
    vi: 'Tạo API token tại id.atlassian.com/manage-profile/security/api-tokens. Nhập "site" là tên miền Jira của bạn (vd: yourcompany.atlassian.net), email đăng nhập Atlassian, và dán API token. LAAM lưu phía máy chủ, không gửi đi đâu khác.',
    en: 'Create an API token at id.atlassian.com/manage-profile/security/api-tokens. Enter "site" as your Jira domain (e.g. yourcompany.atlassian.net), your Atlassian login email, and paste the API token. LAAM stores it server-side and sends it nowhere else.',
    zh: '在 id.atlassian.com/manage-profile/security/api-tokens 创建 API 令牌。"site" 填写你的 Jira 域名（例如 yourcompany.atlassian.net），填入你的 Atlassian 登录邮箱，并粘贴 API 令牌。LAAM 仅保存在服务器端，不会发送到其他地方。',
  },
  'conn.svc.google-calendar.blurb': {
    vi: 'Sự kiện sắp tới trên Google Calendar',
    en: 'Upcoming events on Google Calendar',
    zh: 'Google 日历上即将到来的活动',
  },
  'conn.svc.google-calendar.setup': {
    vi: 'Bấm "Kết nối với Google" để cấp quyền đọc Google Calendar (chỉ đọc). LAAM lưu token phía máy chủ, mã hoá tại chỗ; phiên có thể cần kết nối lại sau ~7 ngày (giới hạn của Google ở chế độ thử nghiệm).',
    en: 'Click "Connect with Google" to grant read access to Google Calendar (read-only). LAAM stores the token server-side, encrypted at rest; the session may need reconnecting after ~7 days (a Google limit in Testing mode).',
    zh: '点击 "使用 Google 连接" 以授予读取 Google 日历的权限（只读）。LAAM 将令牌保存在服务器端并加密存储；会话可能在约 7 天后需要重新连接（Google 测试模式的限制）。',
  },
  'conn.svc.google-drive.blurb': {
    vi: 'Tệp và thư mục trên Google Drive',
    en: 'Files and folders on Google Drive',
    zh: 'Google 云端硬盘上的文件和文件夹',
  },
  'conn.svc.google-drive.setup': {
    vi: 'Bấm "Kết nối với Google" để cấp quyền đọc Google Drive (chỉ đọc). LAAM lưu token phía máy chủ, mã hoá tại chỗ; phiên có thể cần kết nối lại sau ~7 ngày (giới hạn của Google ở chế độ thử nghiệm).',
    en: 'Click "Connect with Google" to grant read access to Google Drive (read-only). LAAM stores the token server-side, encrypted at rest; the session may need reconnecting after ~7 days (a Google limit in Testing mode).',
    zh: '点击 "使用 Google 连接" 以授予读取 Google 云端硬盘的权限（只读）。LAAM 将令牌保存在服务器端并加密存储；会话可能在约 7 天后需要重新连接（Google 测试模式的限制）。',
  },
  'conn.svc.gmail.blurb': {
    vi: 'Đọc và tìm email trong Gmail',
    en: 'Read and search email in Gmail',
    zh: '在 Gmail 中阅读和搜索邮件',
  },
  'conn.svc.gmail.setup': {
    vi: 'Bấm "Kết nối với Google" để cấp quyền đọc Gmail (chỉ đọc). LAAM lưu token phía máy chủ, mã hoá tại chỗ; phiên có thể cần kết nối lại sau ~7 ngày (giới hạn của Google ở chế độ thử nghiệm).',
    en: 'Click "Connect with Google" to grant read access to Gmail (read-only). LAAM stores the token server-side, encrypted at rest; the session may need reconnecting after ~7 days (a Google limit in Testing mode).',
    zh: '点击 "使用 Google 连接" 以授予读取 Gmail 的权限（只读）。LAAM 将令牌保存在服务器端并加密存储；会话可能在约 7 天后需要重新连接（Google 测试模式的限制）。',
  },

  // MCP servers section — personal Model Context Protocol servers the user adds.
  'conn.mcp.heading': { vi: 'Máy chủ MCP', en: 'MCP servers', zh: 'MCP 服务器' },
  'conn.mcp.sub': {
    vi: 'Thêm các máy chủ MCP cá nhân để trợ lý dùng được công cụ của chúng. Cấu hình chỉ lưu trên máy chủ của bạn.',
    en: 'Add your personal MCP servers so the assistant can use their tools. Configuration is stored only on your server.',
    zh: '添加你的个人 MCP 服务器，让助手可以使用它们的工具。配置仅保存在你的服务器上。',
  },
  'conn.mcp.add': { vi: 'Thêm máy chủ MCP', en: 'Add MCP server', zh: '添加 MCP 服务器' },
  'conn.mcp.name': { vi: 'Tên', en: 'Name', zh: '名称' },
  'conn.mcp.url': { vi: 'URL', en: 'URL', zh: 'URL' },
  'conn.mcp.token': { vi: 'Token xác thực (tuỳ chọn)', en: 'Auth token (optional)', zh: '认证令牌（可选）' },
  'conn.mcp.trustReads': { vi: 'Tin tưởng gợi ý chỉ-đọc', en: 'Trust read hints', zh: '信任只读提示' },
  'conn.mcp.trustReadsHint': {
    vi: 'Tin tưởng gợi ý chỉ-đọc của máy chủ này → bỏ qua xác nhận cho công cụ chỉ đọc.',
    en: "Trust this server's read hints → skip confirm for read-only tools.",
    zh: '信任此服务器的只读提示 → 对只读工具跳过确认。',
  },
  'conn.mcp.remove': { vi: 'Gỡ', en: 'Remove', zh: '移除' },
  'conn.mcp.none': { vi: 'Chưa có máy chủ MCP nào.', en: 'No MCP servers yet.', zh: '尚无 MCP 服务器。' },
  'conn.mcp.toolsLabel': { vi: 'Công cụ', en: 'Tools', zh: '工具' },
  'conn.mcp.noTools': { vi: 'Chưa phát hiện công cụ nào', en: 'No tools discovered', zh: '未发现工具' },
  'conn.mcp.addErr': { vi: 'Không thêm được máy chủ MCP', en: 'Could not add MCP server', zh: '无法添加 MCP 服务器' },
  'conn.mcp.adding': { vi: 'Đang thêm…', en: 'Adding…', zh: '添加中…' },
};
