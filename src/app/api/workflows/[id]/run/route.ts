import { auth } from "@/auth";
import { db } from "@/db";
import { publish } from "@/lib/events-bus";
import { executeRun } from "@/lib/workflow/run";
import { runToolRounds } from "@/lib/agent/orchestrator";
import { INTERNAL_TOOLS, modelToolSchemas, makeDispatch } from "@/lib/agent/registry";
import { withSafety } from "@/lib/agent/safety/gate";
import { execute as connectorExecute } from "@/lib/connectors";
import { callOllamaChat } from "@/lib/workflow/ollama";
import { runAgentNode, runConnectorNode } from "@/lib/workflow/executors";
import type { RunContext, WfNode } from "@/lib/workflow/types";

// Wire executors với runtime thật (closure userId). Agent node A0 = read-only:
// tool union chỉ internal read tools; withSafety bọc dispatch (write → throw).
function buildRunNode(userId: string) {
  const tools = modelToolSchemas(INTERNAL_TOOLS, []); // A0: internal read tools only
  return (node: WfNode, ctx: RunContext) => {
    if (node.kind === "connector") {
      return runConnectorNode(node, ctx, { execute: (action, args) => connectorExecute(userId, action, args) });
    }
    const dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now: Date.now(), lang: "vi" }), { internal: INTERNAL_TOOLS });
    return runAgentNode(node, ctx, { runRounds: runToolRounds, callOllama: callOllamaChat, dispatch, tools });
  };
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const { id } = await params;
  const result = await executeRun({ workflowId: id, userId: session.user.id, trigger: "manual" }, { db, publish, buildRunNode });
  if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: result.status });
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
}
