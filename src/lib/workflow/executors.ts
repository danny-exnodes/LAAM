// Hai loại node A0. KHÔNG runtime mới: connector→connectors.execute; agent→
// runToolRounds + 1 call cuối lấy text (runToolRounds break KHÔNG push câu cuối).
// DI để test thuần. (spec §5 dispatch.)
import type { WfAgentNode, WfConnectorNode, WfMcpNode, RunContext } from "./types";
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

// P2 MCP node: compose tên namespaced theo scheme discovery (mcp__<slug>__<tool>)
// rồi đi CÙNG đường execute như connector node — route/error contract y hệt.
export function mcpActionName(server: string, tool: string): string {
  return `mcp__${server}__${tool}`;
}

export async function runMcpNode(node: WfMcpNode, ctx: RunContext, deps: ConnectorDeps): Promise<unknown> {
  const args = interpolateArgs(node.args ?? {}, ctx);
  const result = await deps.execute(mcpActionName(node.server, node.tool), args);
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
  // format (B1): optional — CHỈ call cuối truyền (tool-rounds gọi 2-arg, không đổi).
  callOllama: (messages: ChatMessage[], tools: ConnectorTool[], format?: Record<string, unknown>) => Promise<OllamaChatResponse>;
  dispatch: (name: string, args: unknown) => Promise<unknown>;
  tools: ConnectorTool[];
};

// qwen đôi khi bọc JSON trong ```json fence kể cả khi có format-constraint (Ollama
// version/quant phụ thuộc) — strip trước khi parse, đừng để SyntaxError khó hiểu.
export function stripJsonFence(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export async function runAgentNode(node: WfAgentNode, ctx: RunContext, deps: AgentDeps): Promise<unknown> {
  // resolveTemplate(text) là total→string (PIN-D3a, CTO 06-05) → dùng thẳng, KHÔNG branch type.
  const userPrompt = resolveTemplate(node.prompt, ctx, "text") as string;
  const messages: ChatMessage[] = [
    { role: "system", content: node.system ?? DEFAULT_AGENT_SYSTEM },
    { role: "user", content: userPrompt },
  ];
  const convo = await deps.runRounds(messages, deps.tools, { callOllama: deps.callOllama, dispatch: deps.dispatch });
  // runToolRounds break KHÔNG push câu trả lời cuối → 1 call no-tools lấy text (như /api/chat).
  if (!node.format) {
    const final = await deps.callOllama(convo, []);
    return final?.message?.content ?? "";
  }
  // B1 structured output: format → Ollama constrain JSON; output node = object đã parse
  // ({{steps.<id>.output.<field>}} nội suy được). Parse hỏng → 1 self-repair retry
  // (re-ask kèm parse error — pattern coerceGraph/generate route) rồi fail-loud.
  let content = (await deps.callOllama(convo, [], node.format))?.message?.content ?? "";
  try {
    return JSON.parse(stripJsonFence(content));
  } catch (e) {
    const parseErr = e instanceof Error ? e.message : String(e);
    const repair: ChatMessage[] = [
      ...convo,
      { role: "assistant", content },
      { role: "user", content: `Kết quả vừa rồi không phải JSON hợp lệ (${parseErr}). Sửa lại và CHỈ trả JSON đúng schema.` },
    ];
    content = (await deps.callOllama(repair, [], node.format))?.message?.content ?? "";
    try {
      return JSON.parse(stripJsonFence(content));
    } catch (e2) {
      const err2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`agent "${node.id}": structured output không phải JSON hợp lệ sau 1 lần tự sửa — ${err2}`);
    }
  }
}
