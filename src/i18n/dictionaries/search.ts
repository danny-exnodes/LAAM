import type { Dict } from "../types";

// Search page — global search across sessions / conversations / workflows
// (search.* namespace). The nav label lives in common.ts ('nav.search').
export const searchDict: Dict = {
  "search.title": { vi: "Tìm kiếm", en: "Search", zh: "搜索" },
  "search.subtitle": {
    vi: "Tìm trong phiên agent, hội thoại chat và workflow.",
    en: "Search across agent sessions, chat conversations and workflows.",
    zh: "在代理会话、聊天对话和工作流中搜索。",
  },
  "search.placeholder": {
    vi: "Nhập từ khoá (≥ 2 ký tự)…",
    en: "Type a keyword (≥ 2 characters)…",
    zh: "输入关键词（≥ 2 个字符）…",
  },
  "search.hint": {
    vi: "Nhập ít nhất 2 ký tự để tìm.",
    en: "Type at least 2 characters to search.",
    zh: "请输入至少 2 个字符进行搜索。",
  },
  "search.loading": { vi: "Đang tìm…", en: "Searching…", zh: "搜索中…" },
  "search.error": {
    vi: "Không tìm được. Thử lại.",
    en: "Search failed. Try again.",
    zh: "搜索失败，请重试。",
  },
  "search.empty": {
    vi: "Không có kết quả cho “{q}”.",
    en: "No results for “{q}”.",
    zh: "没有与“{q}”匹配的结果。",
  },
  "search.group.sessions": { vi: "Phiên agent", en: "Agent sessions", zh: "代理会话" },
  "search.group.conversations": { vi: "Hội thoại chat", en: "Chat conversations", zh: "聊天对话" },
  "search.group.workflows": { vi: "Workflow", en: "Workflows", zh: "工作流" },
  "search.session.untitled": { vi: "(chưa có hoạt động)", en: "(no activity yet)", zh: "（暂无活动）" },
  "search.chatNote": {
    vi: "Mở trang Chat rồi chọn hội thoại trong danh sách.",
    en: "Opens the Chat page — pick the conversation from the list.",
    zh: "打开聊天页面后在列表中选择对话。",
  },
};
