// Public landing page (`/`) strings — vi/en/zh, like every other page.
// Marketing copy + the six core feature panels + the secondary feature grid.
// Technical tokens (SSE, OAuth, AES-256, model names, numbers) live as universal
// data in `components/landing/features.ts`, not here.
import type { Dict } from '../types';

export const landing: Dict = {
  // ── Nav ──────────────────────────────────────────────────────────────
  'nav.features': { vi: 'Tính năng', en: 'Features', zh: '功能' },
  'nav.howItWorks': { vi: 'Cách hoạt động', en: 'How it works', zh: '工作原理' },
  'nav.stack': { vi: 'Công nghệ', en: 'Stack', zh: '技术栈' },
  'nav.signin': { vi: 'Đăng nhập', en: 'Sign in', zh: '登录' },
  'nav.getstarted': { vi: 'Bắt đầu', en: 'Get started', zh: '开始使用' },
  'nav.dashboard': { vi: 'Vào bảng điều khiển', en: 'Go to dashboard', zh: '进入仪表盘' },
  'nav.menu': { vi: 'Menu', en: 'Menu', zh: '菜单' },

  // ── Hero ─────────────────────────────────────────────────────────────
  'hero.eyebrow': { vi: 'Giám sát AI Agent cục bộ', en: 'Local AI Agent Monitoring', zh: '本地 AI 智能体监控' },
  'hero.title': { vi: 'Theo dõi các agent của bạn', en: 'Watch your agents', zh: '看着你的智能体' },
  'hero.titleAccent': { vi: 'sống động.', en: 'come alive.', zh: '活起来。' },
  'hero.sub': {
    vi: 'LAAM theo dõi real-time các Claude agent trên máy bạn — kèm trợ lý AI cục bộ, connectors và workflow. Tất cả chạy local. Model miễn phí.',
    en: 'LAAM watches the Claude agents on your machines in real time — plus a local AI assistant, connectors and workflows. All local. The model is free.',
    zh: 'LAAM 实时监控你机器上的 Claude 智能体 —— 还有本地 AI 助手、连接器和工作流。全部本地运行，模型免费。',
  },
  'hero.ctaPrimary': { vi: 'Bắt đầu', en: 'Get started', zh: '开始使用' },
  'hero.ctaSecondary': { vi: 'Đăng nhập', en: 'Sign in', zh: '登录' },
  'hero.scroll': { vi: 'Cuộn xuống', en: 'Scroll', zh: '向下滚动' },

  // ── Mech section ─────────────────────────────────────────────────────
  'mech.k': { vi: 'Nền tảng, hữu hình hoá', en: 'The platform, embodied', zh: '平台的具象化' },
  'mech.title': { vi: 'Một cỗ máy. Sáu siêu năng lực.', en: 'One machine. Six superpowers.', zh: '一台机器，六种超能力。' },
  'mech.sub': {
    vi: 'Cuộn để tháo rời — mỗi bộ phận là một năng lực của LAAM.',
    en: 'Scroll to take it apart — each component is a capability of LAAM.',
    zh: '滚动将其拆解 —— 每个部件都是 LAAM 的一项能力。',
  },

  // ── Core feature 1 — Real-time monitoring (head) ─────────────────────
  'feat.1.title': { vi: 'Giám sát real-time', en: 'Real-time monitoring', zh: '实时监控' },
  'feat.1.desc': {
    vi: 'Thấy mọi Claude agent ngay khi nó hoạt động — trạng thái, thời gian chạy và việc đang làm, stream trực tiếp qua SSE.',
    en: 'See every Claude agent the moment it moves — status, runtime and current task, streamed live over SSE.',
    zh: '在每个 Claude 智能体活动的瞬间看到它 —— 状态、运行时长和当前任务，通过 SSE 实时推送。',
  },
  'feat.1.t1': { vi: 'Phiên trực tiếp', en: 'Live sessions', zh: '实时会话' },
  'feat.1.t2': { vi: 'Thời gian TB', en: 'Avg runtime', zh: '平均时长' },
  'feat.1.t3': { vi: 'Nghi kẹt', en: 'Stuck', zh: '疑似卡住' },

  // ── Core feature 2 — Local AI chat (core) ────────────────────────────
  'feat.2.title': { vi: 'Trợ lý AI cục bộ · $0', en: 'Local AI chat · $0', zh: '本地 AI 对话 · $0' },
  'feat.2.desc': {
    vi: 'Trợ lý đa phương thức chạy trên GPU của bạn — tìm web, OCR, thị giác và gọi tool. Không hoá đơn cloud.',
    en: 'A multimodal assistant on your own GPU — web search, OCR, vision and tool-calling. No cloud bill.',
    zh: '运行在你自己 GPU 上的多模态助手 —— 网页搜索、OCR、视觉和工具调用。没有云账单。',
  },
  'feat.2.t1': { vi: 'Mô hình', en: 'Model', zh: '模型' },
  'feat.2.t2': { vi: 'Chi phí', en: 'Cost', zh: '成本' },
  'feat.2.t3': { vi: 'Công cụ', en: 'Tools', zh: '工具' },

  // ── Core feature 3 — Connectors (left arm) ───────────────────────────
  'feat.3.title': { vi: 'Connectors', en: 'Connectors', zh: '连接器' },
  'feat.3.desc': {
    vi: 'GitHub, Jira, Trello và Google Drive / Calendar / Gmail — thông tin đăng nhập mã hoá theo từng người, ghi có cổng kiểm soát.',
    en: 'GitHub, Jira, Trello and Google Drive / Calendar / Gmail — credentials encrypted per user, writes gated.',
    zh: 'GitHub、Jira、Trello 以及 Google Drive / 日历 / Gmail —— 凭据按用户加密，写操作受控。',
  },
  'feat.3.t1': { vi: 'Dịch vụ', en: 'Services', zh: '服务' },
  'feat.3.t2': { vi: 'Mã hoá', en: 'Crypto', zh: '加密' },
  'feat.3.t3': { vi: 'Ghi', en: 'Writes', zh: '写操作' },

  // ── Core feature 4 — Workflow orchestration (right arm) ──────────────
  'feat.4.title': { vi: 'Điều phối workflow', en: 'Workflow orchestration', zh: '工作流编排' },
  'feat.4.desc': {
    vi: 'Nối agent và connector thành các node và tự động hoá những phần lặp đi lặp lại trong ngày của bạn.',
    en: 'Chain agents and connectors as nodes and automate the repetitive parts of your day.',
    zh: '将智能体和连接器串联为节点，自动化你一天中重复的部分。',
  },
  'feat.4.t1': { vi: 'Node', en: 'Nodes', zh: '节点' },
  'feat.4.t2': { vi: 'Lịch', en: 'Scheduler', zh: '调度器' },
  'feat.4.t3': { vi: 'Lượt chạy', en: 'Runs', zh: '运行次数' },

  // ── Core feature 5 — Multi-machine (left leg) ────────────────────────
  'feat.5.title': { vi: 'Đa máy', en: 'Multi-machine', zh: '多机器' },
  'feat.5.desc': {
    vi: 'Một collector không phụ thuộc gì stream transcript từ mọi máy dev vào chung một màn hình.',
    en: 'A zero-dependency collector streams transcripts from every dev box into one pane of glass.',
    zh: '一个零依赖的采集器将每台开发机的记录汇集到同一个视图。',
  },
  'feat.5.t1': { vi: 'Máy', en: 'Machines', zh: '机器' },
  'feat.5.t2': { vi: 'Xác thực', en: 'Auth', zh: '认证' },
  'feat.5.t3': { vi: 'Thu nhận', en: 'Ingest', zh: '接入' },

  // ── Core feature 6 — Dashboard & insights (right leg) ────────────────
  'feat.6.title': { vi: 'Bảng điều khiển & thống kê', en: 'Dashboard & insights', zh: '仪表盘与洞察' },
  'feat.6.desc': {
    vi: 'Chi phí, token, bảng xếp hạng tool và sơ đồ orchestrator → sub-agent — toàn đội của bạn trong một cái nhìn.',
    en: 'Cost, tokens, a tool leaderboard and an orchestrator → sub-agent graph — your whole fleet at a glance.',
    zh: '成本、token、工具排行榜以及 编排器 → 子智能体 关系图 —— 一眼掌握整个团队。',
  },
  'feat.6.t1': { vi: 'Chi phí', en: 'Cost', zh: '成本' },
  'feat.6.t2': { vi: 'Token', en: 'Tokens', zh: 'Token' },
  'feat.6.t3': { vi: 'Công cụ', en: 'Tools', zh: '工具' },

  // ── Secondary grid ───────────────────────────────────────────────────
  'grid.k': { vi: 'Và hơn thế', en: 'And more', zh: '更多' },
  'grid.title': { vi: 'Mọi thứ còn lại trong hộp', en: 'Everything else in the box', zh: '盒子里的其余一切' },
  'grid.graph.title': { vi: 'Sơ đồ agent', en: 'Agent graph', zh: '智能体关系图' },
  'grid.graph.desc': {
    vi: 'Trực quan hoá cây orchestrator → sub-agent bằng @xyflow/react.',
    en: 'Visualize orchestrator → sub-agent trees with @xyflow/react.',
    zh: '用 @xyflow/react 可视化 编排器 → 子智能体 树。',
  },
  'grid.rbac.title': { vi: 'Xác thực & phân quyền', en: 'Auth & RBAC', zh: '认证与权限' },
  'grid.rbac.desc': {
    vi: 'Vai trò owner / admin / member / viewer trên mọi trang, phiên JWT.',
    en: 'Owner / admin / member / viewer roles on every page, JWT sessions.',
    zh: '每个页面都有 所有者 / 管理员 / 成员 / 访客 角色，JWT 会话。',
  },
  'grid.local.title': { vi: 'Local-first · $0', en: 'Local-first · $0', zh: '本地优先 · $0' },
  'grid.local.desc': {
    vi: 'Chạy trên máy bạn; model cục bộ miễn phí. Dữ liệu không rời khỏi máy.',
    en: 'Runs on your machine; the local model is free. Your data never leaves.',
    zh: '在你的机器上运行；本地模型免费。你的数据从不外流。',
  },
  'grid.audit.title': { vi: 'Nhật ký kiểm toán', en: 'Audit log', zh: '审计日志' },
  'grid.audit.desc': {
    vi: 'Mọi hành động nhạy cảm được ghi lại — ai làm gì, khi nào.',
    en: 'Every sensitive action recorded — who did what, when.',
    zh: '记录每一项敏感操作 —— 谁、做了什么、何时。',
  },
  'grid.i18n.title': { vi: 'Ba ngôn ngữ', en: 'Three languages', zh: '三种语言' },
  'grid.i18n.desc': {
    vi: 'Tiếng Việt, English và 中文 trên toàn bộ ứng dụng.',
    en: 'Vietnamese, English and 中文 across the whole app.',
    zh: '整个应用支持 越南语、英语 和 中文。',
  },
  'grid.world.title': { vi: 'World tools', en: 'World tools', zh: '世界工具' },
  'grid.world.desc': {
    vi: 'Trợ lý tìm web, tính toán chính xác và tự soi các phiên của chính nó.',
    en: 'The assistant searches the web, does exact math, and inspects its own sessions.',
    zh: '助手搜索网页、进行精确计算，并检视自己的会话。',
  },

  // ── Footer ───────────────────────────────────────────────────────────
  'footer.title': { vi: 'Để đội agent của bạn sống động.', en: 'Watch your fleet come alive.', zh: '让你的智能体团队活起来。' },
  'footer.sub': {
    vi: 'Giám sát agent, chat, connectors và workflow — local-first, chạy trên phần cứng của chính bạn.',
    en: 'Local-first agent monitoring, chat, connectors and workflows — running on your own hardware.',
    zh: '本地优先的智能体监控、对话、连接器与工作流 —— 运行在你自己的硬件上。',
  },
  'footer.cta': { vi: 'Bắt đầu', en: 'Get started', zh: '开始使用' },
  'footer.note': { vi: 'Model cục bộ $0 · tự host · công cụ nội bộ', en: '$0 local model · self-hosted · internal tool', zh: '$0 本地模型 · 自托管 · 内部工具' },

  // ── a11y ─────────────────────────────────────────────────────────────
  'a11y.bg': { vi: 'Nền động trang trí', en: 'Decorative animated background', zh: '装饰性动态背景' },
  'a11y.mech': { vi: 'Mô hình 3D minh hoạ nền tảng LAAM', en: 'Decorative 3D model of the LAAM platform', zh: 'LAAM 平台的装饰性 3D 模型' },
};
