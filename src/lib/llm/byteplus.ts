// BytePlus ModelArk provider adapter — full-agent (tool-loop) sibling of ollama.ts.
// BytePlus ModelArk exposes an OpenAI-compatible /chat/completions API (verified:
// docs.byteplus.com/ModelArk/1330626 "Compatible with OpenAI API"). We call it with
// plain fetch (NO new SDK dependency — the Ollama path already establishes the raw-
// fetch pattern, and adding a dep in this shared-worktree setup is hazardous). Two
// entry points mirror the Ollama seam in /api/chat:
//   - byteplusChat()   : one NON-streaming tool round → OllamaChatResponse shape
//                        (so runToolRounds + extractToolTurns work UNCHANGED).
//   - byteplusStream() : the final STREAMING completion → {delta?,usage?} (the same
//                        async-generator contract as ollamaStream / claudeStream).
// The LAAM convo is Ollama-shaped; toOpenAI() translates it at the wire boundary
// (synthesizing tool_call ids, pairing tool results, demoting the orphan web_read
// nudge to a user message), exactly like claude.ts's toAnthropic().
import type { ChatMessage, OllamaChatResponse } from "@/lib/agent/orchestrator";

// Whitelist of model ids surfaced to the picker — curated to what this account has
// ACTIVATED and verified callable (smoke-tested live against the configured endpoint).
// `gpt-oss-120b` works on the Coding Plan endpoint (api/coding/v3); it is a reasoning
// model (returns reasoning_content + content + tool_calls) and supports the full
// tool-loop. Keep this list small + curated; an unknown id fails closed (BytePlus 404
// ModelNotOpen / InvalidEndpointOrModel) rather than silently mis-routing. EXACT
// membership (not a prefix) is the router so a local Ollama `deepseek-r1:7b` is never
// mistaken for a BytePlus model. Add more ids here as the account activates them.
export const BYTEPLUS_MODELS = [
  "gpt-oss-120b",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "dola-seed-2.0-pro",
  "dola-seed-2.0-lite",
  "dola-seed-2.0-code",
  "bytedance-seed-code",
  "kimi-k2.5",
] as const;

export function isBytePlusModel(m: string): boolean {
  return (BYTEPLUS_MODELS as readonly string[]).includes(m);
}

export type BytePlusErrorCode = "auth" | "rate_limit" | "overloaded" | "connection";

// Typed "BytePlus unavailable" — route maps `code` → a tri-lingual notice (pattern
// shared with ClaudeUnavailableError). Errors OUTSIDE these four (e.g. 400 schema)
// throw as a plain Error so the route surfaces a generic 'api' code — fail loud,
// never swallow an unexpected failure as a benign "unavailable".
export class BytePlusUnavailableError extends Error {
  code: BytePlusErrorCode;
  constructor(code: BytePlusErrorCode, message?: string) {
    super(message ?? `BytePlus unavailable: ${code}`);
    this.name = "BytePlusUnavailableError";
    this.code = code;
  }
}

const DEFAULT_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

function baseUrl(): string {
  return (process.env.BYTEPLUS_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

// Lazy read at call time (not import) → testable + restart-free. No key throws
// 'auth' BEFORE any network call (mirrors claude.ts).
function apiKey(): string {
  const k = process.env.BYTEPLUS_API_KEY;
  if (!k) throw new BytePlusUnavailableError("auth", "BYTEPLUS_API_KEY chưa được đặt");
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

// Reasoning budget for gpt-oss / other reasoning models on BytePlus. UNSET → body is left
// untouched and the provider default applies (measured: behaves like "high" — ~9k chars of
// reasoning_content on a data question, most of a slow turn's wall time). Only the three
// documented values are forwarded; anything else is ignored rather than sent to the API.
// Split by phase on purpose: the TOOL rounds are where the model decides what to ask the
// connector (a judgment call — starving it there produced a wrong "no duplicates found" on
// a fraud question), while the FINAL round is only writing up rows it already has, which is
// where most of the wall time goes. CHAT_REASONING_EFFORT sets both unless a phase-specific
// var overrides it.
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
  if (status === 401 || status === 403) return new BytePlusUnavailableError("auth", text);
  if (status === 429) return new BytePlusUnavailableError("rate_limit", text);
  if (status === 503 || status === 529) return new BytePlusUnavailableError("overloaded", text);
  return new Error(`BytePlus ${status}: ${text}`); // unexpected → route surfaces 'api'
}

// Transient on BytePlus's side, not ours: 429 is returned for their OWN capacity
// ("ServerOverloaded"/"TooManyRequests"), not only for a per-key quota, and 503/529 mean the
// same thing. Observed 2026-08-07: two of three consecutive turns died this way while the
// requests were seconds apart and strictly sequential — nothing a client can pace its way out
// of. Losing the whole turn costs far more than one extra call, because the tool rounds have
// already run and only the final generation failed.
const RETRY_STATUSES: ReadonlySet<number> = new Set([429, 503, 529]);
const MAX_RETRIES = 1; // one extra attempt — retrying harder into an overloaded server makes it worse
const DEFAULT_RETRY_DELAY_MS = 2000;

// Tunable per deployment (BYTEPLUS_RETRY_DELAY_MS): a dedicated endpoint can drop it, a shared
// one can raise it. 0 is a legitimate setting — retry immediately — so only a negative or
// unparseable value falls back to the default.
function retryDelayMs(): number {
  const n = Number(process.env.BYTEPLUS_RETRY_DELAY_MS);
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
// read, so both callers (byteplusChat's json, byteplusStream's SSE) are safe to restart. A
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
      throw new BytePlusUnavailableError("connection", e instanceof Error ? e.message : String(e));
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
export async function byteplusChat(opts: {
  model: string;
  messages: ChatMessage[];
  tools?: unknown;
  options?: SamplingOptions;
  signal?: AbortSignal;
}): Promise<OllamaChatResponse> {
  const key = apiKey();
  const body: Record<string, unknown> = {
    model: opts.model,
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
    throw new Error("BytePlus returned no choices (possible content filter / refusal)");
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
// so the usage chunk arrives before [DONE]; a missing usage falls back to 0/0 to match
// the route's always-emit-token-frame handling for the tool path.
export async function* byteplusStream(opts: {
  model: string;
  messages: ChatMessage[];
  options?: SamplingOptions;
  signal?: AbortSignal;
}): AsyncGenerator<{ delta?: string; reasoning?: string; usage?: { in: number; out: number } }> {
  const key = apiKey();
  const body: Record<string, unknown> = {
    model: opts.model,
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
        // Reasoning models (gpt-oss, deepseek-v4) stream reasoning_content BEFORE any
        // content — often 30s+ on a large context. Surface it so the route can keep the
        // client SSE warm; it is NOT part of the answer.
        const reasoning = d?.reasoning_content;
        if (typeof reasoning === "string" && reasoning.length) yield { reasoning };
        if (j?.usage) usage = { in: j.usage.prompt_tokens ?? 0, out: j.usage.completion_tokens ?? 0 };
      } catch {
        /* skip a partial / non-JSON line */
      }
    }
  }
  // Only emit usage when BytePlus actually sent it (include_usage). A 0/0 fallback
  // would be a truthy event → the route's gotUsage flips true → a FAKE $0 token frame
  // gets persisted/emitted on a billed provider. Omitting lets emitTokens=gotUsage
  // correctly drop the frame (Claude-style), so missing usage ≠ fabricated billing.
  if (usage) yield { usage };
}
