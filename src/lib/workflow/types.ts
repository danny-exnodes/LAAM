// Hợp đồng đóng băng cho Workflow engine (A0). Phase sau thêm 'condition'|'foreach'
// vào WfNodeKind + node mới — KHÔNG đổi shape có sẵn. Xem spec §4/§5.

export type WfNodeKind = "agent" | "connector"; // A0; +condition|foreach ở A2

export type WfAgentNode = {
  id: string;
  kind: "agent";
  prompt: string; // interpolated (sink:"text")
  system?: string; // system prompt riêng của node; thiếu → default
  model?: string; // SEAM D-RUNTIME — A0 bỏ qua (luôn dùng harness mặc định)
};

export type WfConnectorNode = {
  id: string;
  kind: "connector";
  connectorId: string; // hiển thị/UI; execute() route theo `action` (tool name)
  action: string; // tool name, vd "demo_list_tasks"
  args: Record<string, unknown>; // mỗi string value có thể chứa {{...}} (sink:"arg")
};

export type WfNode = WfAgentNode | WfConnectorNode;
export type WfEdge = { from: string; to: string };
export type WorkflowGraph = { nodes: WfNode[]; edges: WfEdge[]; viewport?: unknown };

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
};
