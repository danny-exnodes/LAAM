import type { ChatMessage } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";

export type ToolStubs = Record<string, unknown>;

export type DimKey =
  | "tool-selection" | "args" | "grounding"
  | "restraint" | "termination" | "write-intent" | "rich-block";

export type Expect = {
  callsTool?: string | string[];                          // chiều 1 (tất cả phải xuất hiện)
  notCalls?: string[];                                    // chiều 4
  args?: Record<string, (a: Record<string, unknown>) => boolean>; // chiều 2
  finalContains?: string[];                               // chiều 3
  finalNotContains?: string[];                            // chiều 3
  maxRounds?: number;                                     // chiều 5 (số tool-round tối đa)
  emitsBlock?: "chart" | "map";                           // chiều 7
  citesRealUrl?: string[];                                // chiều 3 (Rule 13 cho URL): tập URL hợp lệ model được trích
};

export type Scenario = {
  id: string;
  capability: DimKey;                                     // chiều chính (nhóm scorecard)
  input: string;
  toolStubs?: ToolStubs;                                  // output dispatch trả khi model gọi
  extraToolSchemas?: ConnectorTool[];                     // tool tạm cho model thấy (geo/write)
  expect: Expect;
};

export type DispatchCall = { name: string; args: Record<string, unknown> };

export type RunTrace = {
  convo: ChatMessage[];
  calls: DispatchCall[];
  rounds: number;                                         // số assistant-msg có tool_calls
  finalText: string;
  ms: number;
};

export type GraderResult = { dim: DimKey; pass: boolean; detail?: string };

export type ScenarioScore = {
  id: string;
  capability: DimKey;
  runs: number;
  perDim: Record<string, { passed: number; total: number }>; // pass-rate từng chiều
  fails: string[];                                        // detail các lần trượt
  avgMs: number;
  noCall?: number;                                        // số run KHÔNG gọi tool nào (tách no-call vs wrong-call — Nit 1)
};
