// Cerebras Inference provider adapter — full-agent (tool-loop) sibling of byteplus.ts.
// Cerebras exposes an OpenAI-compatible /v1/chat/completions API (verified:
// inference-docs.cerebras.ai/api-reference/authentication — Bearer auth, chat/completions
// endpoint; inference-docs.cerebras.ai capabilities/tool-use — OpenAI-style `tools`/
// `tool_calls`, gpt-oss-120b supports tool calling). We call it with plain fetch, same as
// byteplus.ts (no new SDK dependency). Two entry points mirror the BytePlus/Ollama seam
// in /api/chat:
//   - cerebrasChat()   : one NON-streaming tool round → OllamaChatResponse shape
//                        (so runToolRounds + extractToolTurns work UNCHANGED).
//   - cerebrasStream() : the final STREAMING completion → {delta?,usage?} (the same
//                        async-generator contract as byteplusStream / claudeStream).
// The LAAM convo is Ollama-shaped; toOpenAI() translates it at the wire boundary, exactly
// like byteplus.ts's own toOpenAI() (duplicated rather than shared: each provider file is
// self-contained in this codebase — see claude.ts/byteplus.ts/ollama.ts — so a future
// wire-format divergence between Cerebras and BytePlus stays local to one file).
import type { ChatMessage, OllamaChatResponse } from "@/lib/agent/orchestrator";

// Whitelist of model ids surfaced to the picker — curated to what Cerebras documents as
// available and tool-call capable. Keep this list small + curated; an unknown id fails
// closed (Cerebras 404/400 model-not-found) rather than silently mis-routing. EXACT
// membership (not a prefix) is the router so a local Ollama tag is never mistaken for a
// Cerebras model. Add more ids here once verified live against the account.
//
// IMPORTANT — the picker id is NOT the wire model id: Cerebras's literal model name
// (`gpt-oss-120b`) is IDENTICAL to BytePlus's, and routing (isBytePlusModel/isCerebrasModel
// in route.ts/internal.ts) is a same-string whitelist membership check. Reusing the bare
// name here would make `isCerebrasModel("gpt-oss-120b")` true and silently steal every
// BytePlus turn the instant both keys are configured. The `-cerebras` suffix keeps picker
// ids globally unique across providers; WIRE_MODEL below maps back to what the API expects.
export const CEREBRAS_MODELS = ["gpt-oss-120b-cerebras"] as const;

export function isCerebrasModel(m: string): boolean {
  return (CEREBRAS_MODELS as readonly string[]).includes(m);
}

const WIRE_MODEL: Readonly<Record<string, string>> = {
  "gpt-oss-120b-cerebras": "gpt-oss-120b",
};

// Translate a picker/routing id → the literal model name Cerebras's API expects. Unknown
// ids pass through unchanged (defensive — isCerebrasModel already gates callers).
function toWireModel(pickerModel: string): string {
  return WIRE_MODEL[pickerModel] ?? pickerModel;
}

export type CerebrasErrorCode = "auth" | "rate_limit" | "overloaded" | "connection";

// Typed "Cerebras unavailable" — route maps `code` → a tri-lingual notice (pattern shared
// with BytePlusUnavailableError/ClaudeUnavailableError). Errors OUTSIDE these four (e.g.
// 400 schema) throw as a plain Error so the route surfaces a generic 'api' code — fail
// loud, never swallow an unexpected failure as a benign "unavailable".
export class CerebrasUnavailableError extends Error {
  code: CerebrasErrorCode;
  constructor(code: CerebrasErrorCode, message?: string) {
    super(message ?? `Cerebras unavailable: ${code}`);
    this.name = "CerebrasUnavailableError";
    this.code = code;
  }
}

const DEFAULT_BASE = "https://api.cerebras.ai/v1";

function baseUrl(): string {
  return (process.env.CEREBRAS_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

// Lazy read at call time (not import) → testable + restart-free. No key throws
// 'auth' BEFORE any network call (mirrors byteplus.ts/claude.ts).
function apiKey(): string {
  const k = process.env.CEREBRAS_API_KEY;
  if (!k) throw new CerebrasUnavailableError("auth", "CEREBRAS_API_KEY chưa được đặt");
  return k;
}

// ---- OpenAI wire types (only the fields we touch) ----
type OAToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type OAMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OAToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type OAChatResponse = {
  choices?: Array<{ message?: { role?: string; content?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }> } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

// args may arrive as an object (Ollama-shaped internal convo) or a JSON string
// (defensive) — stringify for the OpenAI wire either way.
function stringifyArgs(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v ?? {});
  } catch {
    return "{}";
  }
}

// Inbound: OpenAI returns tool-call arguments as a JSON STRING. Parse to an OBJECT so
// the dispatch pipeline (Ollama-shaped) sees the same thing it does from Ollama.
// Malformed → {} (mirrors makeDispatch/parseArgs — never crash a round). Rule 13:
// the LLM-produced argument string is NOT trusted to be echoed; code parses it.
function parseArgs(v: unknown): unknown {
  if (typeof v !== "string") return v ?? {};
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

// Translate the LAAM (Ollama-shaped) convo → OpenAI messages. Synthesize per-message
// tool_call ids; the tool result messages that immediately follow consume them in
// order. The web_read nudge is an orphan tool message (no preceding call) → demote to
// a user message, because OpenAI rejects a role:"tool" message without a tool_call_id.
function toOpenAI(messages: ChatMessage[]): OAMessage[] {
  const out: OAMessage[] = [];
  let pendingIds: string[] = [];
  messages.forEach((m, idx) => {
    if (m.role === "system") {
      out.push({ role: "system", content: m.content ?? "" });
      pendingIds = [];
    } else if (m.role === "assistant") {
      const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
      if (calls.length) {
        const ids = calls.map((_, i) => `call_${idx}_${i}`);
        const tool_calls: OAToolCall[] = calls.map((tc, i) => {
          const fn = (tc as { function?: { name?: string; arguments?: unknown } }).function ?? {};
          return { id: ids[i], type: "function", function: { name: fn.name ?? "", arguments: stringifyArgs(fn.arguments) } };
        });
        // OpenAI accepts null content alongside tool_calls; Ollama uses "".
        out.push({ role: "assistant", content: m.content && m.content.length ? m.content : null, tool_calls });
        pendingIds = [...ids];
      } else {
        out.push({ role: "assistant", content: m.content ?? "" });
        pendingIds = [];
      }
    } else if (m.role === "tool") {
      const id = pendingIds.shift();
      if (id) out.push({ role: "tool", tool_call_id: id, content: m.content ?? "" });
      else out.push({ role: "user", content: m.content ?? "" }); // orphan (nudge) → user
    } else {
      // user (and any other role) → user text. images are dropped (v1 = no vision).
      out.push({ role: "user", content: m.content ?? "" });
      pendingIds = [];
    }
  });
  return out;
}

// Strip LAAM's non-standard `kind` field from the tool schemas (Ollama tolerates it;
// strict OpenAI servers may reject unknown keys). Keep the OpenAI tool shape.
function sanitizeTools(tools: unknown): Array<{ type: string; function: unknown }> {
  if (!Array.isArray(tools)) return [];
  return tools.map((t) => {
    const o = t as { type?: string; function?: unknown };
    return { type: o.type ?? "function", function: o.function };
  });
}

type SamplingOptions = { temperature?: number; top_p?: number; presence_penalty?: number };
function applyOptions(body: Record<string, unknown>, options?: SamplingOptions): void {
  if (!options) return;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  for (const k of ["temperature", "top_p", "presence_penalty"] as const) {
    const v = num(options[k]);
    if (v !== undefined) body[k] = v;
  }
}

// Reasoning budget for gpt-oss on Cerebras — same env vars as byteplus.ts on purpose:
// it is the SAME model id (gpt-oss-120b), so an operator tuning CHAT_REASONING_EFFORT
// expects it to apply regardless of which provider is currently serving that model.
const REASONING_EFFORTS = new Set(["low", "medium", "high"]);
function applyReasoningEffort(body: Record<string, unknown>, phase: "tools" | "final"): void {
  const specific = phase === "tools" ? process.env.CHAT_REASONING_EFFORT_TOOLS : process.env.CHAT_REASONING_EFFORT_FINAL;
  const effort = (specific ?? process.env.CHAT_REASONING_EFFORT ?? "").trim();
  if (REASONING_EFFORTS.has(effort)) body.reasoning_effort = effort;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function mapStatus(status: number, text: string): Error {
  if (status === 401 || status === 403) return new CerebrasUnavailableError("auth", text);
  if (status === 429) return new CerebrasUnavailableError("rate_limit", text);
  if (status === 503 || status === 529) return new CerebrasUnavailableError("overloaded", text);
  return new Error(`Cerebras ${status}: ${text}`); // unexpected → route surfaces 'api'
}

// Transient on Cerebras's side, not ours (pattern mirrors byteplus.ts): 429/503/529 mean
// capacity/overload, not necessarily a per-key quota. One retry only — retrying harder
// into an overloaded server makes it worse, and losing the whole turn costs far more than
// one extra call because the tool rounds have already run and only the final generation
// failed.
const RETRY_STATUSES: ReadonlySet<number> = new Set([429, 503, 529]);
const MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 2000;

// Tunable per deployment (CEREBRAS_RETRY_DELAY_MS): 0 is a legitimate setting — retry
// immediately — so only a negative or unparseable value falls back to the default.
function retryDelayMs(): number {
  const n = Number(process.env.CEREBRAS_RETRY_DELAY_MS);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RETRY_DELAY_MS;
}

// Resolves early when the caller aborts, so a cancelled turn does not sit out the backoff;
// the retry's fetch then rejects immediately on the aborted signal.
const backoff = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });

// Shared POST → returns the raw Response (caller reads json or SSE body). Network
// rejects → 'connection'; non-ok status → typed/plain error via mapStatus.
//
// Retries live HERE and nowhere else: request() returns before a single byte of the body is
// read, so both callers (cerebrasChat's json, cerebrasStream's SSE) are safe to restart. A
// failure after this point — mid-stream, tokens already emitted — must never be retried, or
// the user would see the answer twice.
async function request(key: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      // Network rejects are NOT retried: unlike a 429 they carry no signal that waiting helps,
      // and an aborted turn arrives here too.
      throw new CerebrasUnavailableError("connection", e instanceof Error ? e.message : String(e));
    }
    if (res.ok) return res;
    const text = await safeText(res);
    if (attempt < MAX_RETRIES && RETRY_STATUSES.has(res.status) && !signal?.aborted) {
      await backoff(retryDelayMs(), signal);
      continue;
    }
    throw mapStatus(res.status, text);
  }
}

// One non-streaming tool round. Returns the OllamaChatResponse shape so the route's
// runToolRounds/extractToolTurns consume it unchanged (tool-call arguments mapped
// from OpenAI's JSON string back to an object).
export async function cerebrasChat(opts: {
  model: string;
  messages: ChatMessage[];
  tools?: unknown;
  options?: SamplingOptions;
  signal?: AbortSignal;
}): Promise<OllamaChatResponse> {
  const key = apiKey();
  const body: Record<string, unknown> = {
    model: toWireModel(opts.model),
    messages: toOpenAI(opts.messages),
    stream: false,
  };
  const tools = sanitizeTools(opts.tools);
  if (tools.length) body.tools = tools; // omit on the final (text-only) round
  applyOptions(body, opts.options);
  applyReasoningEffort(body, "tools");

  const res = await request(key, body, opts.signal);
  const data = (await res.json()) as OAChatResponse;
  // Fail loud (Rule 12): a content-filter / refusal can return an EMPTY choices[].
  // Mapping that to empty content would silently break the tool-loop (loop ends with
  // no output, user pays for nothing). Throw a plain Error → the route surfaces 'api'.
  if (!data?.choices?.length) {
    throw new Error("Cerebras returned no choices (possible content filter / refusal)");
  }
  const msg = data.choices[0]?.message ?? {};
  const rawCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  const tool_calls = rawCalls.map((tc) => ({
    function: { name: tc.function?.name ?? "", arguments: parseArgs(tc.function?.arguments) },
  }));
  return {
    message: {
      role: msg.role ?? "assistant",
      content: msg.content ?? "",
      ...(tool_calls.length ? { tool_calls } : {}),
    },
  };
}

// The final streaming completion (no tools). Parses OpenAI SSE → {delta?} per token
// (verbatim, Rule 13) then a final {usage}. stream_options.include_usage is requested
// so the usage chunk arrives before [DONE]; a missing usage falls back to omitting the
// usage event (see below) to match the route's always-emit-token-frame handling.
export async function* cerebrasStream(opts: {
  model: string;
  messages: ChatMessage[];
  options?: SamplingOptions;
  signal?: AbortSignal;
}): AsyncGenerator<{ delta?: string; reasoning?: string; usage?: { in: number; out: number } }> {
  const key = apiKey();
  const body: Record<string, unknown> = {
    model: toWireModel(opts.model),
    messages: toOpenAI(opts.messages),
    stream: true,
    stream_options: { include_usage: true },
  };
  applyOptions(body, opts.options);
  applyReasoningEffort(body, "final");

  const res = await request(key, body, opts.signal);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let usage: { in: number; out: number } | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? ""; // keep the partial last line for the next chunk
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || !line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        const d = j?.choices?.[0]?.delta;
        const delta = d?.content;
        if (typeof delta === "string" && delta.length) yield { delta };
        // Reasoning models (gpt-oss) stream reasoning_content BEFORE any content — often
        // seconds of thinking. Surface it so the route can keep the client SSE warm; it
        // is NOT part of the answer.
        const reasoning = d?.reasoning_content;
        if (typeof reasoning === "string" && reasoning.length) yield { reasoning };
        if (j?.usage) usage = { in: j.usage.prompt_tokens ?? 0, out: j.usage.completion_tokens ?? 0 };
      } catch {
        /* skip a partial / non-JSON line */
      }
    }
  }
  // Only emit usage when Cerebras actually sent it (include_usage). A 0/0 fallback would
  // be a truthy event → the route's gotUsage flips true → a FAKE $0 token frame gets
  // persisted/emitted on a billed provider. Omitting lets emitTokens=gotUsage correctly
  // drop the frame (Claude/BytePlus-style), so missing usage ≠ fabricated billing.
  if (usage) yield { usage };
}
