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
