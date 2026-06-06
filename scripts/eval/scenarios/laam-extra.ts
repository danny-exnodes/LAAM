import type { Scenario } from "../types";

// Tool nội bộ MỚI (world-tools) — selection cho 3 tool chưa từng có scenario.
export const searchSessions: Scenario = {
  id: "laam-search-sessions", capability: "tool-selection",
  input: "Tìm agent nào đang sửa bug auth.",
  toolStubs: { laam_search_sessions: { query: "auth", matches: [
    { id: "sess-9", project: "auth-svc", status: "running", latestActivity: "sửa bug auth login" },
  ] } },
  expect: {
    callsTool: "laam_search_sessions",
    args: { laam_search_sessions: (a) => /auth/i.test(String(a.query)) },
    notCalls: ["laam_list_agents"], finalContains: ["auth-svc"], maxRounds: 2,
  },
};

export const getTimeline: Scenario = {
  id: "laam-get-timeline", capability: "args",
  input: "Cho tôi dòng thời gian của agent sess-42.",
  toolStubs: { laam_get_timeline: { total: 2, truncated: false, events: [
    { type: "tool", name: "Edit", ts: "2026-06-06T01:00:00Z" }, { type: "message", role: "assistant" },
  ] } },
  expect: { callsTool: "laam_get_timeline", args: { laam_get_timeline: (a) => a.id === "sess-42" }, maxRounds: 2 },
};

export const queryAudit: Scenario = {
  id: "laam-query-audit", capability: "tool-selection",
  input: "Gần đây hệ thống có hành động ghi (audit) gì?",
  toolStubs: { laam_query_audit: { entries: [
    { action: "connector.write", target: "trello:card", at: "2026-06-06T02:00:00Z" },
  ] } },
  expect: { callsTool: "laam_query_audit", notCalls: ["laam_query_stats"], finalContains: ["connector.write"], maxRounds: 2 },
};
