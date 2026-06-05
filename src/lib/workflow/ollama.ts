// Một call /api/chat non-streaming. Mirror payload của /api/chat route.
import type { ChatMessage, OllamaChatResponse } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = process.env.DEFAULT_CHAT_MODEL ?? "gemma4:e4b";
const NUM_CTX = Math.max(2048, Number(process.env.CHAT_NUM_CTX) || 16384);

export async function callOllamaChat(messages: ChatMessage[], tools: ConnectorTool[]): Promise<OllamaChatResponse> {
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(tools.length ? { tools } : {}),
      options: { num_ctx: NUM_CTX },
      stream: false,
    }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  return (await r.json()) as OllamaChatResponse;
}
