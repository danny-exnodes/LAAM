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
  // Vắng mặt ⇒ "text" (RENDER_GUIDE), y hệt trước đây. Đặt "voice" để đo ĐÚNG system prompt
  // /constellation dùng thật (VOICE_GUIDE) — thiếu trường này, eval không bao giờ chạm được
  // phần prompt đã xác định là gây dừng tra cứu sớm trên production.
  mode?: "voice" | "text";
  // Lịch sử hội thoại TRƯỚC lượt hiện tại — mô phỏng history-replay của route.ts: CHỈ role +
  // content (không tool_calls), đúng shape route.ts đọc từ DB rồi replay (route.ts:352-356).
  // Dùng để tái hiện ca "một câu trả lời nông cũ trong hội thoại khiến lượt sau lặp lại y
  // hệt" — xác nhận bằng tay trên production (xem CHANGELOG). Vắng mặt ⇒ lượt đầu (cũ).
  priorMessages?: { role: "user" | "assistant"; content: string }[];
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
