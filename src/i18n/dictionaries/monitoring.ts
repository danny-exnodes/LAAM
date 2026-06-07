import type { Dict } from "../types";

// Monitoring page — unified "monitored runs" across sources (monitoring.* namespace).
export const monitoringDict: Dict = {
  "monitoring.title": { vi: "Giám sát", en: "Monitoring", zh: "监控" },
  "monitoring.subtitle": {
    vi: "Các phiên agent từ mọi nguồn: máy local, chat, workflow và agent ngoài (API/MCP).",
    en: "Agent sessions from every source: local machines, chat, workflows and external agents (API/MCP).",
    zh: "来自所有来源的代理会话：本地机器、聊天、工作流和外部代理（API/MCP）。",
  },
  "monitoring.tab.all": { vi: "Tất cả", en: "All", zh: "全部" },
  "monitoring.tab.local": { vi: "Máy local", en: "Local", zh: "本地" },
  "monitoring.tab.chat": { vi: "Chat", en: "Chat", zh: "聊天" },
  "monitoring.tab.workflow": { vi: "Workflow", en: "Workflows", zh: "工作流" },
  "monitoring.tab.external": { vi: "Ngoài (API/MCP)", en: "External (API/MCP)", zh: "外部 (API/MCP)" },
  "monitoring.col.source": { vi: "Nguồn", en: "Source", zh: "来源" },
  "monitoring.col.title": { vi: "Phiên", en: "Run", zh: "会话" },
  "monitoring.col.status": { vi: "Trạng thái", en: "Status", zh: "状态" },
  "monitoring.col.lastActivity": { vi: "Hoạt động cuối", en: "Last activity", zh: "最后活动" },
  "monitoring.col.tokens": { vi: "Token (vào/ra)", en: "Tokens (in/out)", zh: "令牌（入/出）" },
  "monitoring.col.cost": { vi: "Chi phí", en: "Cost", zh: "成本" },
  "monitoring.empty": { vi: "Chưa có phiên nào.", en: "No runs yet.", zh: "暂无会话。" },
  "monitoring.loading": { vi: "Đang tải…", en: "Loading…", zh: "正在加载…" },
  "monitoring.error": { vi: "Không tải được dữ liệu giám sát.", en: "Failed to load monitoring data.", zh: "无法加载监控数据。" },
};
