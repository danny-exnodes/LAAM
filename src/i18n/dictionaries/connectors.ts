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
  // Per-provider authorize button: {name} = consent-screen brand (Google / Jira / Slack / Trello / Zalo OA).
  'conn.connectWith': { vi: 'Kết nối với {name}', en: 'Connect with {name}', zh: '使用 {name} 连接' },
  'conn.manualOption': {
    vi: 'Hoặc nhập token thủ công',
    en: 'Or enter a token manually',
    zh: '或手动输入令牌',
  },
  'conn.trelloFinishing': {
    vi: 'Đang hoàn tất kết nối Trello…',
    en: 'Finishing the Trello connection…',
    zh: '正在完成 Trello 连接…',
  },
  'conn.reconnect': { vi: 'Kết nối lại', en: 'Reconnect', zh: '重新连接' },
  'conn.needsReconnect': { vi: 'Phiên hết hạn', en: 'Session expired', zh: '会话已过期' },
  'conn.account': { vi: 'Tài khoản', en: 'Account', zh: '账户' },
  'conn.connectedOk': { vi: 'Đã kết nối thành công.', en: 'Connected successfully.', zh: '连接成功。' },
  'conn.errNotConfigured': {
    vi: 'OAuth chưa được cấu hình trên máy chủ cho dịch vụ này.',
    en: 'OAuth is not configured on the server for this service.',
    zh: '服务器尚未为此服务配置 OAuth。',
  },
  'conn.errDenied': { vi: 'Bạn đã từ chối cấp quyền.', en: 'You declined the permission.', zh: '你拒绝了授权。' },
  'conn.errState': { vi: 'Phiên kết nối không hợp lệ, thử lại.', en: 'Invalid session, please retry.', zh: '会话无效，请重试。' },
  'conn.errExpired': { vi: 'Liên kết đã hết hạn, thử lại.', en: 'The link expired, please retry.', zh: '链接已过期，请重试。' },
  'conn.errExchange': {
    vi: 'Không đổi được mã với nhà cung cấp, thử lại.',
    en: 'Could not exchange the code with the provider, please retry.',
    zh: '无法与提供方交换代码，请重试。',
  },
  'conn.errForbidden': {
    vi: 'Tài khoản chỉ-xem không được kết nối/sửa connector.',
    en: 'A view-only account cannot connect or modify connectors.',
    zh: '只读账户无法连接或修改连接器。',
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
    vi: 'Tạo app tại trello.com/power-ups/admin (trang trello.com/app-key cũ đã ngừng hoạt động): bấm "New", điền tên app và Workspace, bỏ trống "Iframe connector URL". Mở tab "API Key" → bấm "Generate a new API Key" rồi copy API Key — KHÔNG copy ô "Secret" bên cạnh (dán nhầm Secret là nguyên nhân phổ biến của lỗi 401 "invalid key"). Token: dùng nút uỷ quyền 1-click của LAAM khi server đã cấu hình TRELLO_API_KEY, hoặc tự tạo token từ liên kết trên trang API Key. Lưu ý cho người vận hành: phải thêm origin của LAAM vào "Allowed origins" của app thì luồng uỷ quyền mới hoạt động. LAAM lưu cả hai phía máy chủ, không gửi đi đâu khác.',
    en: 'Create an app at trello.com/power-ups/admin (the old trello.com/app-key page is gone): click "New", fill in the app name and Workspace, leave "Iframe connector URL" empty. Open the "API Key" tab → "Generate a new API Key" and copy the API Key — do NOT copy the adjacent "Secret" (pasting the Secret is the common cause of 401 "invalid key"). Token: use LAAM\'s 1-click authorize button once the server has TRELLO_API_KEY configured, or mint a token yourself from the link on the API Key page. Operator note: LAAM\'s origin must be added to the app\'s "Allowed origins" for the authorize flow to work. LAAM stores both server-side and sends them nowhere else.',
    zh: '在 trello.com/power-ups/admin 创建应用（旧的 trello.com/app-key 页面已停用）：点击 "New"，填写应用名称和 Workspace，"Iframe connector URL" 留空。打开 "API Key" 标签 → "Generate a new API Key" 并复制 API Key — 不要复制旁边的 "Secret"（误粘 Secret 是 401 "invalid key" 错误的常见原因）。令牌：服务器配置 TRELLO_API_KEY 后使用 LAAM 的一键授权按钮，或从 API Key 页面上的链接自行生成令牌。运维提示：必须将 LAAM 的 origin 添加到应用的 "Allowed origins"，授权流程才能工作。LAAM 将两者保存在服务器端，不会发送到其他地方。',
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
  'conn.svc.jira.setup': {
    vi: 'Tạo OAuth 2.0 integration tại developer.atlassian.com/console/myapps, thêm scopes Jira API (read:jira-work, write:jira-work, read:jira-user) + User Identity API (read:me), đặt Callback URL {OAUTH_PUBLIC_BASE_URL}/api/connectors/atlassian/callback, bật Distribution → Sharing, rồi đặt env ATLASSIAN_OAUTH_CLIENT_ID / ATLASSIAN_OAUTH_CLIENT_SECRET. OAuth xác minh trên prod base — môi trường dev dùng nhập tay (site/email/API token).',
    en: 'Create an OAuth 2.0 integration at developer.atlassian.com/console/myapps, add Jira API scopes (read:jira-work, write:jira-work, read:jira-user) + the User Identity API (read:me), set the Callback URL to {OAUTH_PUBLIC_BASE_URL}/api/connectors/atlassian/callback, enable Distribution → Sharing, then set ATLASSIAN_OAUTH_CLIENT_ID / ATLASSIAN_OAUTH_CLIENT_SECRET. OAuth is verified on the prod base — use manual entry (site/email/API token) on dev.',
    zh: '在 developer.atlassian.com/console/myapps 创建 OAuth 2.0 集成，添加 Jira API scopes（read:jira-work、write:jira-work、read:jira-user）+ User Identity API（read:me），将 Callback URL 设为 {OAUTH_PUBLIC_BASE_URL}/api/connectors/atlassian/callback，启用 Distribution → Sharing，然后设置 ATLASSIAN_OAUTH_CLIENT_ID / ATLASSIAN_OAUTH_CLIENT_SECRET。OAuth 在生产环境 base 上验证 — 开发环境使用手动输入（site/email/API token）。',
  },
  'conn.svc.slack.blurb': {
    vi: 'Kênh, tin nhắn Slack của workspace (bot)',
    en: "The workspace's Slack channels and messages (bot)",
    zh: '工作区的 Slack 频道与消息（机器人）',
  },
  'conn.svc.slack.help': {
    vi: 'Bot token là CHUNG cho cả workspace: mọi người dùng LAAM kết nối cùng workspace sẽ dùng chung danh tính bot. Muốn bot ĐỌC lịch sử một kênh, phải mời bot vào kênh đó (/invite @LAAM); gửi tin vào kênh public thì không cần mời.',
    en: 'The bot token is SHARED for the whole workspace: every LAAM user connecting the same workspace uses the same bot identity. For the bot to READ a channel\'s history it must be invited to that channel (/invite @LAAM); posting to public channels needs no invite.',
    zh: '机器人令牌为整个工作区共享：连接同一工作区的每个 LAAM 用户都使用同一个机器人身份。要让机器人读取某个频道的历史记录，必须先把它邀请进该频道（/invite @LAAM）；向公开频道发消息则无需邀请。',
  },
  'conn.svc.slack.setup': {
    vi: 'Tạo app tại api.slack.com/apps (From scratch) → OAuth & Permissions: thêm 6 bot scopes (channels:read, groups:read, channels:history, groups:history, chat:write, chat:write.public) và Redirect URL {OAUTH_PUBLIC_BASE_URL}/api/connectors/slack/callback → Basic Information: copy Client ID/Secret vào env SLACK_CLIENT_ID/SLACK_CLIENT_SECRET. KHÔNG bật Token Rotation / PKCE / Public Distribution.',
    en: 'Create an app at api.slack.com/apps (From scratch) → OAuth & Permissions: add the 6 bot scopes (channels:read, groups:read, channels:history, groups:history, chat:write, chat:write.public) and the Redirect URL {OAUTH_PUBLIC_BASE_URL}/api/connectors/slack/callback → Basic Information: copy the Client ID/Secret into SLACK_CLIENT_ID/SLACK_CLIENT_SECRET. Do NOT enable Token Rotation / PKCE / Public Distribution.',
    zh: '在 api.slack.com/apps 创建应用（From scratch）→ OAuth & Permissions：添加 6 个 bot scopes（channels:read、groups:read、channels:history、groups:history、chat:write、chat:write.public）和 Redirect URL {OAUTH_PUBLIC_BASE_URL}/api/connectors/slack/callback → Basic Information：将 Client ID/Secret 复制到 SLACK_CLIENT_ID/SLACK_CLIENT_SECRET。不要启用 Token Rotation / PKCE / Public Distribution。',
  },
  'conn.svc.whatsapp.blurb': {
    vi: 'Gửi tin WhatsApp qua Cloud API (chỉ gửi, trong cửa sổ 24h)',
    en: 'Send WhatsApp messages via the Cloud API (send-only, within the 24h window)',
    zh: '通过 Cloud API 发送 WhatsApp 消息（仅发送，限 24 小时窗口内）',
  },
  'conn.svc.whatsapp.help': {
    vi: 'Cần WhatsApp BUSINESS Platform — KHÔNG dùng được tài khoản WhatsApp cá nhân. Tạo Meta app loại Business tại developers.facebook.com, thêm product WhatsApp. Access token: tạo System User token vĩnh viễn trong business.facebook.com → Business Settings → System Users (gán quyền cả App lẫn WABA, chọn whatsapp_business_messaging + whatsapp_business_management, expiration: Never). Phone number ID lấy ở App Dashboard → WhatsApp → API Setup (là ID, không phải số điện thoại). Token tạm 24h ở API Setup chỉ dùng để thử.',
    en: 'Requires the WhatsApp BUSINESS Platform — personal WhatsApp accounts cannot be used. Create a Business-type Meta app at developers.facebook.com and add the WhatsApp product. Access token: create a permanent System User token in business.facebook.com → Business Settings → System Users (assign both the App and the WABA, pick whatsapp_business_messaging + whatsapp_business_management, expiration: Never). The Phone Number ID is in App Dashboard → WhatsApp → API Setup (it is an ID, not the phone number). The 24h temporary token on API Setup is for testing only.',
    zh: '需要 WhatsApp 商业平台 — 无法使用个人 WhatsApp 账号。在 developers.facebook.com 创建 Business 类型的 Meta 应用并添加 WhatsApp 产品。访问令牌：在 business.facebook.com → Business Settings → System Users 创建永久 System User 令牌（同时分配 App 和 WABA，勾选 whatsapp_business_messaging + whatsapp_business_management，有效期选 Never）。Phone Number ID 在 App Dashboard → WhatsApp → API Setup（它是 ID，不是电话号码）。API Setup 上的 24 小时临时令牌仅供测试。',
  },
  'conn.svc.zalo.blurb': {
    vi: 'Tin nhắn Zalo Official Account (OA) — cần OA xác thực',
    en: 'Zalo Official Account (OA) messages — requires a verified OA',
    zh: 'Zalo 官方账号（OA）消息 — 需要已认证的 OA',
  },
  'conn.svc.zalo.help': {
    vi: 'Người bấm Kết nối phải là ADMIN của OA. Consent cấp cho CẢ OA (một token đại diện OA, không phải từng người dùng) — team chỉ định MỘT admin kết nối; admin khác bấm kết nối lại có thể làm đứt kết nối của đồng nghiệp. OA phải được XÁC THỰC (giấy tờ doanh nghiệp) và API gửi tin cần gói trả phí (ví dụ gói Tăng trưởng).',
    en: 'Whoever clicks Connect must be an ADMIN of the OA. Consent is granted for the WHOLE OA (one token represents the OA, not each user) — the team should designate ONE admin to connect; another admin re-connecting may break a colleague\'s connection. The OA must be VERIFIED (business documents) and the messaging API requires a paid package (e.g. the Growth tier).',
    zh: '点击连接的人必须是该 OA 的管理员。授权授予整个 OA（一个令牌代表 OA，而非每个用户）— 团队应指定一名管理员进行连接；其他管理员重新连接可能会断开同事的连接。OA 必须经过认证（企业资质文件），消息 API 需要付费套餐（例如增长版）。',
  },
  'conn.svc.zalo.setup': {
    vi: 'Tạo app tại developers.zalo.me → sản phẩm Official Account: liên kết OA + kích hoạt API + đặt Callback URL {OAUTH_PUBLIC_BASE_URL}/api/connectors/zalo/callback → bật app Live → đặt env ZALO_APP_ID/ZALO_APP_SECRET. OAuth xác minh trên prod base.',
    en: 'Create an app at developers.zalo.me → Official Account product: link the OA + activate the API + set the Callback URL to {OAUTH_PUBLIC_BASE_URL}/api/connectors/zalo/callback → switch the app Live → set ZALO_APP_ID/ZALO_APP_SECRET. OAuth is verified on the prod base.',
    zh: '在 developers.zalo.me 创建应用 → Official Account 产品：关联 OA + 激活 API + 将 Callback URL 设为 {OAUTH_PUBLIC_BASE_URL}/api/connectors/zalo/callback → 将应用切换为 Live → 设置 ZALO_APP_ID/ZALO_APP_SECRET。OAuth 在生产环境 base 上验证。',
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
  'conn.mcp.toolsOn': {
    vi: '{on}/{total} công cụ đang bật',
    en: '{on}/{total} tools enabled',
    zh: '已启用 {on}/{total} 个工具',
  },
  'conn.mcp.pickTools': { vi: 'Chọn công cụ', en: 'Choose tools', zh: '选择工具' },
  'conn.mcp.hideTools': { vi: 'Thu gọn', en: 'Collapse', zh: '收起' },
  'conn.mcp.pickToolsHint': {
    vi: 'Mỗi công cụ đang bật đều được gửi kèm cho mô hình ở MỖI lượt gọi. Tắt bớt công cụ không dùng sẽ giảm token và giảm khả năng mô hình chọn nhầm.',
    en: 'Every enabled tool is sent to the model on EVERY round. Turning off tools you do not use cuts tokens and leaves less for the model to mis-pick.',
    zh: '每个已启用的工具都会在每一轮发送给模型。关闭不用的工具可减少 token，也降低模型选错的机会。',
  },
  'conn.mcp.selectAll': { vi: 'Bật tất cả', en: 'Enable all', zh: '全部启用' },
  'conn.mcp.selectNone': { vi: 'Tắt tất cả', en: 'Disable all', zh: '全部禁用' },
  'conn.mcp.dialogTitle': { vi: 'Chọn công cụ — {name}', en: 'Choose tools — {name}', zh: '选择工具 — {name}' },
  'conn.mcp.searchTools': { vi: 'Tìm công cụ…', en: 'Search tools…', zh: '搜索工具…' },
  'conn.mcp.noMatch': { vi: 'Không có công cụ nào khớp.', en: 'No tools match.', zh: '没有匹配的工具。' },
  'conn.mcp.close': { vi: 'Đóng', en: 'Close', zh: '关闭' },
  'conn.mcp.cancel': { vi: 'Huỷ', en: 'Cancel', zh: '取消' },
  'conn.mcp.noDesc': { vi: 'Không có mô tả', en: 'No description', zh: '无描述' },
  'conn.mcp.moreTools': { vi: '+{n} nữa', en: '+{n} more', zh: '还有 {n} 个' },
  'conn.mcp.saveTools': { vi: 'Lưu', en: 'Save', zh: '保存' },
  'conn.mcp.savingTools': { vi: 'Đang lưu…', en: 'Saving…', zh: '保存中…' },
  'conn.mcp.saveToolsErr': {
    vi: 'Không lưu được danh sách công cụ',
    en: 'Could not save the tool list',
    zh: '无法保存工具列表',
  },
  'conn.mcp.allOffWarn': {
    vi: 'Tắt hết công cụ nghĩa là trợ lý không gọi được gì từ máy chủ này.',
    en: 'With every tool off the assistant cannot call anything on this server.',
    zh: '全部关闭后，助手将无法调用此服务器的任何功能。',
  },
  'conn.mcp.addErr': { vi: 'Không thêm được máy chủ MCP', en: 'Could not add MCP server', zh: '无法添加 MCP 服务器' },
  'conn.mcp.adding': { vi: 'Đang thêm…', en: 'Adding…', zh: '添加中…' },
};
