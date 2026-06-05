import type { Scenario } from "../types";

const ALL_READ = ["laam_list_agents", "laam_get_agent", "laam_query_stats", "laam_list_machines", "laam_find_stuck"];

export const greeting: Scenario = {
  id: "greeting-restraint", capability: "restraint",
  input: "Xin chào!",
  expect: { notCalls: ALL_READ, maxRounds: 0 },
};

export const chitchat: Scenario = {
  id: "chitchat-restraint", capability: "restraint",
  input: "Bạn làm được những gì?",
  expect: { notCalls: ALL_READ, maxRounds: 0 },
};
