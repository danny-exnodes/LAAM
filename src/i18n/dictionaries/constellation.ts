import type { Dict } from "../types";

export const constellation: Dict = {
  "constellation.title": { vi: "Bản đồ trợ lý", en: "Agent Constellation", zh: "助手星图" },
  "constellation.regionAria": { vi: "Bản đồ agent và công cụ", en: "Agents and tools map", zh: "Agent 与工具星图" },
  "constellation.back": { vi: "Mở trong Chat", en: "Open in Chat", zh: "在聊天中打开" },
  "constellation.nodeAria": { vi: "Chọn {name}", en: "Focus {name}", zh: "聚焦 {name}" },
  "constellation.commandPlaceholder": { vi: "Nhắn tin…", en: "Message…", zh: "发消息…" },
  "constellation.send": { vi: "Gửi", en: "Send", zh: "发送" },
  "constellation.chat": { vi: "Trò chuyện", en: "Chat", zh: "聊天" },
  "constellation.voice": { vi: "Giọng nói", en: "Voice", zh: "语音" },
  "constellation.stateIdle": { vi: "SẴN SÀNG", en: "STANDBY", zh: "待命" },
  "constellation.stateListening": { vi: "ĐANG NGHE", en: "LISTENING", zh: "聆听中" },
  "constellation.stateThinking": { vi: "ĐANG XỬ LÝ", en: "PROCESSING", zh: "处理中" },
  "constellation.stateSpeaking": { vi: "ĐANG NÓI", en: "SPEAKING", zh: "朗读中" },
  "constellation.greetMorning": { vi: "Chào buổi sáng", en: "Good morning", zh: "早上好" },
  "constellation.greetAfternoon": { vi: "Chào buổi chiều", en: "Good afternoon", zh: "下午好" },
  "constellation.greetEvening": { vi: "Chào buổi tối", en: "Good evening", zh: "晚上好" },
  "constellation.onThisDay": { vi: "HÔM NAY", en: "ON THIS DAY", zh: "历史上的今天" },
  "constellation.connectHint": { vi: "Chưa kết nối — mở Connectors để bật", en: "Not connected — open Connectors to enable", zh: "未连接 — 打开连接器以启用" },
  "constellation.approve": { vi: "Xác nhận", en: "Approve", zh: "确认" },
  "constellation.deny": { vi: "Từ chối", en: "Deny", zh: "拒绝" },
  // "on this day" facts (rotated; static, curated)
  "constellation.fact1": { vi: "Tim Berners-Lee đề xuất World Wide Web tại CERN.", en: "Tim Berners-Lee proposed the World Wide Web at CERN.", zh: "蒂姆·伯纳斯-李在 CERN 提出万维网。" },
  "constellation.fact2": { vi: "Kiến trúc Transformer (2017) là nền tảng của phần lớn LLM hiện đại.", en: "The Transformer (2017) underpins most modern LLMs.", zh: "Transformer 架构（2017）是大多数现代大模型的基础。" },
  "constellation.fact3": { vi: "Hệ đa tác tử có gốc lý thuyết từ thập niên 1980.", en: "Multi-agent systems trace back to 1980s theory.", zh: "多智能体系统的理论可追溯到 1980 年代。" },
  // Open-Meteo weather-code buckets (WMO) — added in Task 7
  "constellation.wxClear": { vi: "Trời quang", en: "Clear", zh: "晴" },
  "constellation.wxCloud": { vi: "Nhiều mây", en: "Cloudy", zh: "多云" },
  "constellation.wxRain": { vi: "Mưa", en: "Rain", zh: "雨" },
  "constellation.wxSnow": { vi: "Tuyết", en: "Snow", zh: "雪" },
  "constellation.wxFog": { vi: "Sương mù", en: "Fog", zh: "雾" },
  "constellation.wxStorm": { vi: "Giông", en: "Storm", zh: "雷暴" },
  // Model switcher
  "constellation.model": { vi: "Mô hình", en: "Model", zh: "模型" },
  "constellation.modelAria": { vi: "Chọn mô hình", en: "Select model", zh: "选择模型" },
  // Boot / loading sequence
  "constellation.bootTitle": { vi: "LAAM", en: "LAAM", zh: "LAAM" },
  "constellation.boot1": { vi: "khởi tạo lõi…", en: "initializing core…", zh: "初始化核心…" },
  "constellation.boot2": { vi: "nạp danh sách agent", en: "loading agents", zh: "加载 agent" },
  "constellation.boot3": { vi: "kết nối connector · MCP", en: "connecting connectors · MCP", zh: "连接连接器 · MCP" },
  "constellation.boot4": { vi: "đồng bộ công cụ nội bộ", en: "syncing internal tools", zh: "同步内部工具" },
  "constellation.boot5": { vi: "hiệu chỉnh dòng năng lượng", en: "calibrating energy flows", zh: "校准能量流" },
  "constellation.boot6": { vi: "trực tuyến", en: "online", zh: "在线" },
  // Spoken greeting on load-complete ({name} = user display name)
  "constellation.greetVoice": {
    vi: "Chào {name}, Jarvis đang lắng nghe bạn. Hãy cho tôi biết bạn cần gì.",
    en: "Hi {name}, Jarvis is listening to you. Please tell me what you want.",
    zh: "你好 {name}，Jarvis 正在聆听。请告诉我你需要什么。",
  },
};
