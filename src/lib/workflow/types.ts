// Hợp đồng đóng băng cho Workflow engine (A0). G1 (A2) thêm 'condition'|'foreach'
// vào WfNodeKind + node mới — KHÔNG đổi shape A0 có sẵn. Xem spec §4/§5.

export type WfNodeKind = "agent" | "connector" | "condition" | "foreach" | "mcp"; // A0 + G1 + P2(mcp)

export type WfAgentNode = {
  id: string;
  kind: "agent";
  prompt: string; // interpolated (sink:"text")
  system?: string; // system prompt riêng của node; thiếu → default
  // P3: tham chiếu custom_agent preset (per-user). Runtime resolve → override system;
  // preset mất = fail-loud. AI-generate KHÔNG sinh field này (Rule 13 — model không biết id thật).
  customAgentId?: string;
  model?: string; // SEAM D-RUNTIME — A0 bỏ qua (luôn dùng harness mặc định)
  // B1: JSON-schema cho Ollama structured output (param `format`). Có → output node
  // = object đã JSON.parse (judge-verify: condition eq trên {{steps.x.output.field}}).
  format?: Record<string, unknown>;
};

export type WfConnectorNode = {
  id: string;
  kind: "connector";
  connectorId: string; // hiển thị/UI; execute() route theo `action` (tool name)
  action: string; // tool name, vd "demo_list_tasks"
  args: Record<string, unknown>; // mỗi string value có thể chứa {{...}} (sink:"arg")
};

// ── G1: predicate (so sánh + all/any) cho condition node ──
export type Op = "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains" | "not_contains" | "exists" | "not_exists";
export type Comparator = { left: string; op: Op; right?: unknown }; // left/right (string) có thể chứa {{...}} (sink:"arg")
export type Predicate = Comparator | { all: Predicate[] } | { any: Predicate[] };

export type WfConditionNode = { id: string; kind: "condition"; when: Predicate };
export type WfForeachNode = { id: string; kind: "foreach"; items: string; body: WorkflowGraph }; // items={{...}}→array; body chạy đệ quy mỗi item

// P2: gọi tool 1 MCP server per-user trong workflow. Lưu (server slug, tool THẬT);
// runtime compose mcp__<server>__<tool> → connectors.execute() route nhánh MCP.
// Write/chưa-trust = HIGH-blast fail-closed (assertMcpAllowed) — chỉ read chạy.
export type WfMcpNode = {
  id: string;
  kind: "mcp";
  server: string; // slug MCP server (per-user, xem connector_credentials mcp:<slug>)
  tool: string; // tên tool THẬT trên server (không namespace)
  args: Record<string, unknown>; // mỗi string value có thể chứa {{...}} (sink:"arg")
};

export type WfNode = WfAgentNode | WfConnectorNode | WfConditionNode | WfForeachNode | WfMcpNode;
export type WfEdge = { from: string; to: string; label?: string }; // label cho nhánh condition ("true"/"false")
export type WorkflowGraph = {
  nodes: WfNode[];
  edges: WfEdge[];
  viewport?: unknown;
  // Editor-persisted canvas layout: nodeId → xy. Ignored by the engine/validate.
  positions?: Record<string, { x: number; y: number }>;
};

// G1: cận chạy (chống runaway). Token-precise budgeting hoãn (đổi runNode contract A0).
export type Budget = { maxSteps: number; maxForeachItems: number };
export const DEFAULT_BUDGET: Budget = { maxSteps: 200, maxForeachItems: 100 };

// Blackboard. run_step = nguồn bền; context = working-set RAM (spec D-STATE).
export type RunContext = {
  trigger: Record<string, unknown>;
  steps: Record<string, { output: unknown }>;
  vars: Record<string, unknown>;
};

export function emptyContext(trigger: Record<string, unknown>): RunContext {
  return { trigger, steps: {}, vars: {} };
}

// Một node đã chạy — engine phát ra, run.ts persist + SSE.
export type StepRecord = {
  nodeId: string;
  kind: WfNodeKind;
  seq: number;
  status: "running" | "succeeded" | "failed";
  input?: unknown;
  output?: unknown;
  error?: string;
  parentNodeId?: string; // G1: foreach iteration → id của foreach node (run.ts map → parentStepId)
};
