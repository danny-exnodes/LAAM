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
import type { RunContext, WfNode } from "./types";

export function buildRunNode(userId: string) {
  const tools = modelToolSchemas(INTERNAL_TOOLS, []); // internal read tools only
  // Engine xử lý condition/foreach NỘI BỘ → runNode chỉ nhận agent|connector (hợp đồng A0).
  return (node: WfNode, ctx: RunContext) => {
    if (node.kind === "connector") {
      assertConnectorAllowed(node.action, INTERNAL_TOOLS); // blast gate (fail-closed)
      return runConnectorNode(node, ctx, { execute: (action, args) => connectorExecute(userId, action, args) });
    }
    if (node.kind === "agent") {
      const dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now: Date.now(), lang: "vi" }), { internal: INTERNAL_TOOLS });
      return runAgentNode(node, ctx, { runRounds: runToolRounds, callOllama: callOllamaChat, dispatch, tools });
    }
    throw new Error(`runNode: kind không thực thi trực tiếp "${(node as { kind: string }).kind}" (engine xử lý nội bộ)`);
  };
}
