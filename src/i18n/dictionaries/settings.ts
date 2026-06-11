import type { Dict } from "../types";

// Settings hub strings (settings.* namespace).
export const settingsDict: Dict = {
  "settings.account": { vi: "Tài khoản", en: "Account", zh: "账户" },
  "settings.logout": { vi: "Đăng xuất", en: "Sign out", zh: "退出登录" },
  "settings.servers": { vi: "Máy chủ", en: "Servers", zh: "服务器" },
  "settings.machines.label": { vi: "Máy & phần cứng", en: "Machines & hardware", zh: "机器与硬件" },
  "settings.machines.desc": {
    vi: "Giám sát đa máy · phần cứng máy chủ · token",
    en: "Multi-machine monitoring · host hardware · tokens",
    zh: "多机监控 · 主机硬件 · 令牌",
  },
  "settings.reliability.label": { vi: "Độ tin cậy", en: "Reliability", zh: "可靠性" },
  "settings.reliability.desc": {
    vi: "Kiểm thử, đánh giá và báo cáo agent.",
    en: "Test, evaluate and report on agents.",
    zh: "测试、评估和代理报告。",
  },
  "settings.monitoring.label": { vi: "Giám sát", en: "Monitoring", zh: "监控" },
  "settings.monitoring.desc": {
    vi: "Phiên agent real-time theo nguồn.",
    en: "Real-time agent runs by source.",
    zh: "按来源实时查看 agent 运行。",
  },
  "settings.graph.label": { vi: "Sơ đồ agent", en: "Agent graph", zh: "智能体关系图" },
  "settings.graph.desc": {
    vi: "Đồ thị điều phối orchestrator → sub-agent.",
    en: "Orchestrator → sub-agent graph.",
    zh: "协调器 → 子代理关系图。",
  },
  "settings.users.label": { vi: "Người dùng", en: "Users", zh: "用户" },
  "settings.users.desc": {
    vi: "Quản lý thành viên · vai trò · vô hiệu hoá",
    en: "Manage members · roles · off-boarding",
    zh: "管理成员 · 角色 · 停用",
  },
  "settings.access.label": { vi: "Token truy cập", en: "Access tokens", zh: "访问令牌" },
  "settings.access.desc": {
    vi: "Token cá nhân cho API / MCP",
    en: "Personal tokens for API / MCP",
    zh: "用于 API / MCP 的个人令牌",
  },

  "settings.display": { vi: "Hiển thị", en: "Display", zh: "显示" },
  "settings.appearance": { vi: "Giao diện", en: "Appearance", zh: "外观" },
  "settings.language": { vi: "Ngôn ngữ", en: "Language", zh: "语言" },
};
