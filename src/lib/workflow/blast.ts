// Workflow-readiness gate cho connector node trong workflow. Một connector action mà
// resolveKind nói là `write` VÀ isWorkflowSafe nói là CHƯA-clear → fail-closed THROW.
// Reads qua được; cleared writes (workflowSafe:true) qua được. Wire vào buildRunNode
// TRƯỚC connectorExecute (real-run) → không có đường nào chạy write chưa-clear.
import { resolveKind, isWorkflowSafe } from "@/lib/agent/safety/policy";
import type { Tool } from "@/lib/agent/types";

export function assertConnectorAllowed(action: string, internal: Tool[]): void {
  // Chỉ WRITE mới xét readiness; reads luôn cho qua.
  if (resolveKind(action, internal) !== "write") return;
  if (!isWorkflowSafe(action)) {
    throw new Error(
      `workflow: '${action}' chưa được clear cho workflow (fail-closed)`,
    );
  }
  // Cleared write → qua.
}
