// buildRunNode CHUNG cho cả manual (route) lẫn scheduled (tickExecute). Wire
// executors với runtime thật (closure userId). Agent node = read-only: tool union
// chỉ internal read tools; withSafety bọc dispatch (write → throw). Connector node
// đi qua BLAST GATE (assertConnectorAllowed) TRƯỚC khi execute → write blast-cao
// fail-closed ở MỌI đường (manual + scheduled, spec F1 v1-LOW-only).
import { runToolRounds } from "@/lib/agent/orchestrator";
import { INTERNAL_TOOLS, modelToolSchemas, makeDispatch } from "@/lib/agent/registry";
import { withSafety } from "@/lib/agent/safety/gate";
import { execute as connectorExecute } from "@/lib/connectors";
import { callOllamaChat } from "./ollama";
import { runAgentNode, runConnectorNode } from "./executors";
import { assertConnectorAllowed } from "./blast";
import { resolveKind } from "@/lib/agent/safety/policy";
import type { RunContext, WfNode } from "./types";

export function buildRunNode(userId: string, opts?: { dryRun?: boolean }) {
  const dryRun = opts?.dryRun ?? false;
  const tools = modelToolSchemas(INTERNAL_TOOLS, []); // internal read tools only
  // Engine xử lý condition/foreach NỘI BỘ → runNode chỉ nhận agent|connector (hợp đồng A0).
  return (node: WfNode, ctx: RunContext) => {
    if (node.kind === "connector") {
      assertConnectorAllowed(node.action, INTERNAL_TOOLS); // blast gate (fail-closed) — áp CẢ dry-run
      // Dry-run: vô hiệu hoá SIDE-EFFECT của node WRITE — trả output giả để node sau /
      // nhánh condition vẫn chạy tiếp; READ vẫn execute THẬT (local model $0, xem spec).
      // Blast gate KHÔNG bị bỏ qua → write blast-cao vẫn lỗi đúng như run thật (item D).
      const execute = (action: string, args: Record<string, unknown>): Promise<unknown> =>
        dryRun && resolveKind(action, INTERNAL_TOOLS) === "write"
          ? Promise.resolve({ dryRun: true, wouldHaveCalled: action, args })
          : connectorExecute(userId, action, args);
      return runConnectorNode(node, ctx, { execute });
    }
    if (node.kind === "agent") {
      const dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now: Date.now(), lang: "vi" }), { internal: INTERNAL_TOOLS });
      return runAgentNode(node, ctx, { runRounds: runToolRounds, callOllama: callOllamaChat, dispatch, tools });
    }
    throw new Error(`runNode: kind không thực thi trực tiếp "${(node as { kind: string }).kind}" (engine xử lý nội bộ)`);
  };
}
