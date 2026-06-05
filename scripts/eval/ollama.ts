import type { ChatMessage, OllamaChatResponse, ToolRoundsDeps } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";

export type OllamaCfg = {
  baseUrl: string;
  model: string;
  options: { num_ctx?: number; presence_penalty?: number; temperature?: number; top_p?: number };
};

// Khớp ToolRoundsDeps["callOllama"]. Non-streaming, gửi tools khi có (như prod).
export function makeRealOllama(cfg: OllamaCfg): ToolRoundsDeps["callOllama"] {
  return async (messages: ChatMessage[], tools: ConnectorTool[]): Promise<OllamaChatResponse> => {
    const r = await fetch(`${cfg.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        ...(tools.length ? { tools } : {}),
        options: cfg.options,
        stream: false,
      }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    return (await r.json()) as OllamaChatResponse;
  };
}

// Đọc cấu hình từ env — y các default prod (route.ts) để đo ĐÚNG điều kiện thật.
export function ollamaCfgFromEnv(): OllamaCfg {
  return {
    baseUrl: (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, ""),
    model: process.env.DEFAULT_CHAT_MODEL ?? "qwen3-vl:8b-instruct-q8_0",
    options: {
      num_ctx: Math.max(2048, Number(process.env.CHAT_NUM_CTX) || 16384),
      presence_penalty: Number.isFinite(Number(process.env.CHAT_PRESENCE_PENALTY)) ? Number(process.env.CHAT_PRESENCE_PENALTY) : 0.2,
      temperature: Number.isFinite(Number(process.env.EVAL_TEMPERATURE)) ? Number(process.env.EVAL_TEMPERATURE) : 0.6,
    },
  };
}
