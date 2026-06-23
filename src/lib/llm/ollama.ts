import type { ChatMessage, OllamaChatResponse } from "@/lib/agent/orchestrator";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const numCtx = () => Math.max(2048, Number(process.env.CHAT_NUM_CTX) || 16384);

// One NON-streaming Ollama /api/chat call — the local sibling of byteplusChat. Shared
// by the internal-model router (summaries, workflow agent/generate/review) so there is
// a SINGLE local code path (no drift across the three former copies). Optional `tools`
// (omitted when empty) and `format` (Ollama JSON-schema constrained output). Throws a
// plain `Ollama <status>` on a non-ok response — fail loud.
export async function ollamaChat(opts: {
  model: string;
  messages: ChatMessage[];
  tools?: unknown[];
  format?: object;
  temperature?: number;
}): Promise<OllamaChatResponse> {
  const options: Record<string, unknown> = { num_ctx: numCtx() };
  if (typeof opts.temperature === "number") options.temperature = opts.temperature;
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    options,
    stream: false,
  };
  if (opts.tools && opts.tools.length) body.tools = opts.tools;
  if (opts.format) body.format = opts.format;
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  return (await r.json()) as OllamaChatResponse;
}

// Ollama streaming completion as an async generator mirroring claudeStream's
// {delta?,usage?} shape so the chat route can finalize either provider uniformly.
// Takes an ALREADY-FETCHED streaming Response — callers keep their own fetch +
// status handling (the error messages differ by path). NDJSON: message.content is
// the token delta; the {done:true} line carries prompt_eval_count / eval_count.
// A final usage is ALWAYS yielded (0/0 if no done line) — Ollama always emits a
// token frame, unlike Claude which omits it when usage never arrives.
export async function* ollamaStream(
  res: Response,
): AsyncGenerator<{ delta?: string; usage?: { in: number; out: number } }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let tokensIn = 0;
  let tokensOut = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const j = JSON.parse(t);
        const tok = j?.message?.content ?? "";
        if (tok) yield { delta: tok };
        if (j?.done) {
          if (typeof j.prompt_eval_count === "number") tokensIn = j.prompt_eval_count;
          if (typeof j.eval_count === "number") tokensOut = j.eval_count;
        }
      } catch {
        /* skip partial line */
      }
    }
  }
  yield { usage: { in: tokensIn, out: tokensOut } };
}
