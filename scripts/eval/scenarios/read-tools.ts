import type { Scenario } from "../types";

export const stuckBasic: Scenario = {
  id: "stuck-basic", capability: "tool-selection",
  input: "Agent nào đang kẹt?",
  toolStubs: { laam_find_stuck: { thresholdMin: 10, stuck: [
    { id: "sess-42", project: "billing-svc", status: "running", stuck: true, latestActivity: "chạy migration DB", durationMin: 42 },
  ] } },
  expect: { callsTool: "laam_find_stuck", notCalls: ["laam_query_stats", "laam_list_machines"], finalContains: ["billing-svc"], maxRounds: 2 },
};

export const tokensToday: Scenario = {
  id: "tokens-today", capability: "tool-selection",
  input: "Hôm nay tiêu hết bao nhiêu token?",
  toolStubs: { laam_query_stats: {
    totals: { sessions: 12, running: 3, tokensIn: 45000, tokensOut: 12345, costUsd: 0.42 },
    byStatus: { running: 3, idle: 2, done: 7 }, byModel: [], topProjects: [], topTools: [],
  } },
  expect: { callsTool: "laam_query_stats", notCalls: ["laam_list_machines"], finalContains: ["12345"], maxRounds: 2 },
};

export const agentDetail: Scenario = {
  id: "agent-detail", capability: "args",
  input: "Cho tôi chi tiết agent ở project billing-svc.",
  toolStubs: {
    laam_list_agents: { agents: [{ id: "sess-42", project: "billing-svc", status: "running" }] },
    laam_get_agent: { agent: { id: "sess-42", project: "billing-svc", status: "running", latestActivity: "chạy migration DB", tools: [] } },
  },
  expect: {
    callsTool: ["laam_list_agents", "laam_get_agent"],
    args: { laam_get_agent: (a) => a.id === "sess-42" }, // id THẬT từ lượt list, không bịa "billing-svc"
    finalContains: ["billing-svc"], maxRounds: 3,
  },
};

export const machinesOnline: Scenario = {
  id: "machines-online", capability: "tool-selection",
  input: "Máy nào đang online?",
  toolStubs: { laam_list_machines: { machines: [
    { id: "m1", name: "gaming-pc", online: true }, { id: "m2", name: "laptop", online: false },
  ] } },
  expect: { callsTool: "laam_list_machines", notCalls: ["laam_query_stats"], finalContains: ["gaming-pc"], maxRounds: 2 },
};
