// Hai loại node A0. KHÔNG runtime mới: connector→connectors.execute; agent→
// runToolRounds + 1 call cuối lấy text (runToolRounds break KHÔNG push câu cuối).
// DI để test thuần. (spec §5 dispatch.)
import type { WfAgentNode, WfConnectorNode, RunContext } from "./types";
import type { ChatMessage, OllamaChatResponse } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";
import { resolveTemplate, interpolateArgs } from "./interpolate";

const DEFAULT_AGENT_SYSTEM =
  "Bạn là một bước xử lý trong workflow. Trả lời ngắn gọn, chính xác, đúng yêu cầu của bước.";

export type ConnectorDeps = {
  execute: (action: string, args: Record<string, unknown>) => Promise<unknown>;
};

export async function runConnectorNode(
  node: WfConnectorNode,
  ctx: RunContext,
  deps: ConnectorDeps,
): Promise<unknown> {
  const args = interpolateArgs(node.args ?? {}, ctx);
  const result = await deps.execute(node.action, args);
  // execute() trả {error} thay vì throw — nâng thành fail-stop node (spec §5.4).
  if (result && typeof result === "object" && "error" in (result as Record<string, unknown>)) {
    throw new Error(String((result as { error: unknown }).error));
  }
  return result;
}

export type AgentDeps = {
  runRounds: (
    messages: ChatMessage[],
    tools: ConnectorTool[],
    deps: { callOllama: (m: ChatMessage[], t: ConnectorTool[]) => Promise<OllamaChatResponse>; dispatch: (n: string, a: unknown) => Promise<unknown> },
  ) => Promise<ChatMessage[]>;
  callOllama: (messages: ChatMessage[], tools: ConnectorTool[]) => Promise<OllamaChatResponse>;
  dispatch: (name: string, args: unknown) => Promise<unknown>;
  tools: ConnectorTool[];
};

export async function runAgentNode(node: WfAgentNode, ctx: RunContext, deps: AgentDeps): Promise<unknown> {
  // resolveTemplate(text) là total→string (PIN-D3a, CTO 06-05) → dùng thẳng, KHÔNG branch type.
  const userPrompt = resolveTemplate(node.prompt, ctx, "text") as string;
  const messages: ChatMessage[] = [
    { role: "system", content: node.system ?? DEFAULT_AGENT_SYSTEM },
    { role: "user", content: userPrompt },
  ];
  const convo = await deps.runRounds(messages, deps.tools, { callOllama: deps.callOllama, dispatch: deps.dispatch });
  // runToolRounds break KHÔNG push câu trả lời cuối → 1 call no-tools lấy text (như /api/chat).
  const final = await deps.callOllama(convo, []);
  return final?.message?.content ?? "";
}
