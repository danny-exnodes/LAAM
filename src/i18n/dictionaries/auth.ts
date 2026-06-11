// Auth pages (login / register) + the shared AuthShell hero (auth.* namespace).
// Named authDict (not `auth`) to avoid confusion with the Auth.js `auth()` export.
import type { Dict } from '../types';

export const authDict: Dict = {
  // shared form fields
  'auth.email': { vi: 'Email', en: 'Email', zh: '邮箱' },
  'auth.password': { vi: 'Mật khẩu', en: 'Password', zh: '密码' },
  'auth.name': { vi: 'Tên', en: 'Name', zh: '姓名' },

  // login page
  'auth.login.title': { vi: 'Đăng nhập', en: 'Sign in', zh: '登录' },
  'auth.login.sub': { vi: 'Chào mừng trở lại — đăng nhập để tiếp tục.', en: 'Welcome back — sign in to continue.', zh: '欢迎回来 — 登录以继续。' },
  'auth.login.err': { vi: 'Email hoặc mật khẩu không đúng.', en: 'Incorrect email or password.', zh: '邮箱或密码不正确。' },
  'auth.login.submit': { vi: 'Đăng nhập', en: 'Sign in', zh: '登录' },
  'auth.login.submitting': { vi: 'Đang đăng nhập…', en: 'Signing in…', zh: '正在登录…' },
  'auth.login.noAccount': { vi: 'Chưa có tài khoản?', en: 'No account yet?', zh: '还没有账户？' },
  'auth.login.registerLink': { vi: 'Đăng ký', en: 'Sign up', zh: '注册' },

  // register page ("owner" is the RBAC role name — kept verbatim in all langs)
  'auth.register.title': { vi: 'Tạo tài khoản', en: 'Create an account', zh: '创建账户' },
  'auth.register.sub': { vi: 'Người đăng ký đầu tiên sẽ là owner.', en: 'The first user to register becomes the owner.', zh: '第一位注册的用户将成为 owner。' },
  'auth.register.err': { vi: 'Đăng ký thất bại.', en: 'Registration failed.', zh: '注册失败。' },
  'auth.register.passwordMin': { vi: 'Mật khẩu (≥ 8 ký tự)', en: 'Password (≥ 8 characters)', zh: '密码（≥ 8 个字符）' },
  'auth.register.invite': { vi: 'Mã mời', en: 'Invite code', zh: '邀请码' },
  'auth.register.inviteHint': { vi: 'Chỉ cần khi quản trị viên bật chế độ đăng ký bằng mã mời.', en: 'Only needed when the administrator enables invite-only registration.', zh: '仅在管理员启用邀请注册时需要。' },
  'auth.register.submit': { vi: 'Đăng ký', en: 'Sign up', zh: '注册' },
  'auth.register.submitting': { vi: 'Đang tạo…', en: 'Creating…', zh: '正在创建…' },
  'auth.register.haveAccount': { vi: 'Đã có tài khoản?', en: 'Already have an account?', zh: '已有账户？' },
  'auth.register.loginLink': { vi: 'Đăng nhập', en: 'Sign in', zh: '登录' },

  // AuthShell hero (the brand kicker reuses common 'brand.sub')
  'auth.hero.title': { vi: 'Theo dõi đội Agent AI của bạn theo thời gian thực.', en: 'Watch your AI agent team in real time.', zh: '实时监控你的 AI 智能体团队。' },
  'auth.hero.fAgents': { vi: 'Agents', en: 'Agents', zh: '智能体' },
  'auth.hero.fAgentsSub': { vi: 'thời gian thực', en: 'real-time', zh: '实时' },
  'auth.hero.fChat': { vi: 'Chat cục bộ', en: 'Local chat', zh: '本地对话' },
  'auth.hero.fChatSub': { vi: 'miễn phí · $0', en: 'free · $0', zh: '免费 · $0' },
  'auth.hero.fConnectors': { vi: 'Connectors', en: 'Connectors', zh: '连接器' },
  'auth.hero.fConnectorsSub': { vi: '7 dịch vụ', en: '7 services', zh: '7 个服务' },
  'auth.hero.note': { vi: 'Chạy hoàn toàn cục bộ · Dữ liệu của bạn không rời máy.', en: 'Runs fully locally · Your data never leaves your machine.', zh: '完全本地运行 · 数据不会离开你的设备。' },
};
