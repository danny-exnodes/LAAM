// Một call /api/chat non-streaming. Mirror payload của /api/chat route.
import type { ChatMessage, OllamaChatResponse } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = process.env.DEFAULT_CHAT_MODEL ?? "gemma4:e4b";
const NUM_CTX = Math.max(2048, Number(process.env.CHAT_NUM_CTX) || 16384);

// format (B1): optional JSON-schema → Ollama structured output (executors truyền ở call CUỐI của agent node).
export async function callOllamaChat(messages: ChatMessage[], tools: ConnectorTool[], format?: Record<string, unknown>): Promise<OllamaChatResponse> {
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(tools.length ? { tools } : {}),
      ...(format ? { format } : {}),
      options: { num_ctx: NUM_CTX },
      stream: false,
    }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  return (await r.json()) as OllamaChatResponse;
}

// Structured generation (#3): ask the model to emit JSON matching `format` (Ollama's
// schema-constrained output). No tools — one-shot. Returns the raw JSON string from
// message.content; the caller parses → coerceGraph → assertRunnable. Lower temperature
// for steadier structure.
export async function callOllamaGenerate(messages: ChatMessage[], format: object): Promise<string> {
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      format,
      options: { num_ctx: NUM_CTX, temperature: 0.2 },
      stream: false,
    }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  const data = (await r.json()) as OllamaChatResponse;
  return data.message?.content ?? "";
}
