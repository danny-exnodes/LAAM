import type { Dict } from "../types";

// Monitoring page — the unified home. ONE entry point: an "Agents" tab (the rich
// live AgentsClient, which subsumes the old Local + External api/mcp sources since
// those ARE agent_sessions) plus read-model "Chat" and "Workflow" tables.
export const monitoringDict: Dict = {
  "monitoring.title": { vi: "Giám sát", en: "Monitoring", zh: "监控" },
  "monitoring.subtitle": {
    vi: "Một cửa cho mọi phiên: Agents (máy local + agent ngoài API/MCP, live), Chat và Workflow.",
    en: "One home for every run: Agents (local machines + external API/MCP agents, live), Chat and Workflows.",
    zh: "所有会话的统一入口：Agents（本地机器 + 外部 API/MCP 代理，实时）、聊天和工作流。",
  },
  "monitoring.tab.agents": { vi: "Agents", en: "Agents", zh: "代理" },
  "monitoring.tab.chat": { vi: "Chat", en: "Chat", zh: "聊天" },
  "monitoring.tab.workflow": { vi: "Workflow", en: "Workflows", zh: "工作流" },
  "monitoring.col.source": { vi: "Nguồn", en: "Source", zh: "来源" },
  "monitoring.col.title": { vi: "Phiên", en: "Run", zh: "会话" },
  "monitoring.col.status": { vi: "Trạng thái", en: "Status", zh: "状态" },
  "monitoring.col.lastActivity": { vi: "Hoạt động cuối", en: "Last activity", zh: "最后活动" },
  "monitoring.col.tokens": { vi: "Token (vào/ra)", en: "Tokens (in/out)", zh: "令牌（入/出）" },
  "monitoring.col.cost": { vi: "Chi phí", en: "Cost", zh: "成本" },
  "monitoring.empty": { vi: "Chưa có phiên nào.", en: "No runs yet.", zh: "暂无会话。" },
  "monitoring.loading": { vi: "Đang tải…", en: "Loading…", zh: "正在加载…" },
  "monitoring.error": { vi: "Không tải được dữ liệu giám sát.", en: "Failed to load monitoring data.", zh: "无法加载监控数据。" },
  // Freshness: distinguishes "UI is live" (SSE on the Agents tab) from "data is
  // fresh" (read-model tables only refresh on Sync). {n} = seconds since last load.
  "monitoring.syncedAgo": {
    vi: "Dữ liệu cập nhật {n}s trước",
    en: "Data {n}s ago",
    zh: "数据 {n} 秒前",
  },
  "monitoring.syncedJustNow": { vi: "Dữ liệu vừa cập nhật", en: "Data just now", zh: "数据刚刚更新" },
  "monitoring.live": { vi: "Trực tiếp (SSE)", en: "Live (SSE)", zh: "实时 (SSE)" },
};
