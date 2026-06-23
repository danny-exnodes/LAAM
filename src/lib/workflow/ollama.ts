// Workflow LLM seam — now PROVIDER-AWARE via the cloud-first internal-model router.
//
// These two functions are the only LLM calls in the workflow engine: agent nodes
// (runtime.ts wires callOllamaChat as the tool-loop `callOllama` + the final text
// round), the AI review route, and the AI generate route. They used to fetch the local
// Ollama endpoint directly, so an agent-step workflow hard-broke when the local model
// was off. They now delegate to lib/llm/internal, which routes to BytePlus/Claude when
// a cloud key is configured and to local Ollama ($0) otherwise. The names + signatures
// are unchanged so every caller (runtime, review, generate) keeps working as-is.
import type { ChatMessage, OllamaChatResponse } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";
import { callModelChat, callModelGenerate } from "@/lib/llm/internal";

// format (B1): optional JSON-schema → structured output (executors pass it on the FINAL
// call of an agent node). Provider-aware: forwarded to the local path; best-effort on
// cloud (the agent node self-repairs invalid JSON).
export async function callOllamaChat(
  messages: ChatMessage[],
  tools: ConnectorTool[],
  format?: Record<string, unknown>,
): Promise<OllamaChatResponse> {
  return callModelChat(messages, tools as unknown[], format);
}

// Structured generation: ask the model to emit JSON matching `format`. No tools —
// one-shot. Returns the raw JSON string from message.content; the caller parses →
// coerceGraph → assertRunnable.
export async function callOllamaGenerate(messages: ChatMessage[], format: object): Promise<string> {
  return callModelGenerate(messages, format);
}
