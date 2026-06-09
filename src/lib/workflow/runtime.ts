// buildRunNode CHUNG cho cả manual (route) lẫn scheduled (tickExecute). Wire
// executors với runtime thật (closure userId). Agent node = read-only: tool union
// chỉ internal read tools; withSafety bọc dispatch (write → throw). Connector node
// đi qua WORKFLOW-READINESS GATE (assertConnectorAllowed) TRƯỚC execute trên REAL-run →
// write chưa-clear fail-closed (manual + scheduled). Dry-run preview: gate skip + mock write.
import { runToolRounds } from "@/lib/agent/orchestrator";
import { INTERNAL_TOOLS, modelToolSchemas, makeDispatch } from "@/lib/agent/registry";
import { withSafety } from "@/lib/agent/safety/gate";
import { execute as connectorExecute } from "@/lib/connectors";
import { callOllamaChat } from "./ollama";
import { runAgentNode, runConnectorNode } from "./executors";
import { assertConnectorAllowed } from "./blast";
import { assertRecipientAllowed } from "./recipient";
import { resolveKind } from "@/lib/agent/safety/policy";
import type { RunContext, WfNode } from "./types";

export function buildRunNode(userId: string, opts?: { dryRun?: boolean }) {
  const dryRun = opts?.dryRun ?? false;
  const tools = modelToolSchemas(INTERNAL_TOOLS, []); // internal read tools only
  // Engine xử lý condition/foreach NỘI BỘ → runNode chỉ nhận agent|connector (hợp đồng A0).
  return (node: WfNode, ctx: RunContext) => {
    if (node.kind === "connector") {
      // SECURITY-CRITICAL SEAM: real-run enforces the readiness gate (default = real =
      // enforced). Dry-run is the NARROW, explicit opt-out — writes are mocked below, so an
      // un-cleared write can be previewed but NEVER executes on any path.
      if (!dryRun) assertConnectorAllowed(node.action, INTERNAL_TOOLS);
      // Dry-run: vô hiệu hoá SIDE-EFFECT của node WRITE — trả output giả để node sau /
      // nhánh condition vẫn chạy tiếp; READ vẫn execute THẬT (local model $0, xem spec).
      const execute = (action: string, args: Record<string, unknown>): Promise<unknown> => {
        if (dryRun && resolveKind(action, INTERNAL_TOOLS) === "write") {
          return Promise.resolve({ dryRun: true, wouldHaveCalled: action, args });
        }
        // Destination-safety: enforce the recipient allowlist on the RESOLVED args (real-run
        // only — dry-run mocked above; no-op for tools without a recipientField). Runs after
        // the readiness gate + interpolation. (spec 2026-06-09 §3.4.)
        assertRecipientAllowed(action, args);
        return connectorExecute(userId, action, args);
      };
      return runConnectorNode(node, ctx, { execute });
    }
    if (node.kind === "agent") {
      const dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now: Date.now(), lang: "vi" }), { internal: INTERNAL_TOOLS });
      return runAgentNode(node, ctx, { runRounds: runToolRounds, callOllama: callOllamaChat, dispatch, tools });
    }
    throw new Error(`runNode: kind không thực thi trực tiếp "${(node as { kind: string }).kind}" (engine xử lý nội bộ)`);
  };
}
