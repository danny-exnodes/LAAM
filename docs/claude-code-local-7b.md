# Can Claude Code drive a local 7B model (Qwen2.5-Coder 7B via Ollama)?

**Feasibility study — 2026-06-02.** Question: can the Claude Code CLI be pointed at a
local model (Qwen2.5-Coder 7B on Ollama) to implement code, and is it worth doing?

**Bottom line:** Technically **yes — and easier than expected** (no custom shim needed on
this machine, because the installed Ollama already speaks Anthropic's API). But for actually
*implementing code agentically in a project like LAAM*, **7B is not worth it today.** The
hard blocker is tool-call format, not wiring. Details and evidence below.

> Scope note: this is research only. Nothing in the live stack was changed and Claude Code
> itself was **not** reconfigured. All tests below were read-only `curl`s against the
> already-running Ollama (`:11434`) and the LAAM proxy (`:11435`).

---

## 1. How Claude Code picks its backend

Claude Code talks to a backend over the **Anthropic Messages API** shape: `POST /v1/messages`,
with request fields like `model`, `messages`, `max_tokens`, `tools` (each tool having an
`input_schema`), and `stream`. It does **not** speak the OpenAI Chat Completions shape
(`/v1/chat/completions`) or Ollama's native `/api/chat` shape.

You retarget it with one environment variable, **`ANTHROPIC_BASE_URL`**, plus auth vars:

```bash
# Per-session only — do NOT put in shell profile / ~/.claude/settings.json for a test
ANTHROPIC_BASE_URL=http://localhost:11434 \
ANTHROPIC_AUTH_TOKEN=ollama \
ANTHROPIC_API_KEY= \
claude --model qwen2.5-coder:7b
```

Caveats worth knowing:
- `ANTHROPIC_BASE_URL` is read **once at process start** and never re-checked; changing it
  mid-session silently has no effect.
- When `ANTHROPIC_BASE_URL` points at a non-first-party host, Claude Code **disables MCP tool
  search by default**, and you lose first-party niceties (server-side prompt caching, the
  hosted tools, account-level rate handling, etc.).

Sources:
- Ollama × Claude Code integration: <https://docs.ollama.com/integrations/claude-code>
- What `ANTHROPIC_BASE_URL` does / when it's read:
  <https://fazm.ai/blog/route-claude-api-through-custom-endpoint-anthropic-base-url>
- Original feature request thread: <https://github.com/anthropics/claude-code/issues/216>

---

## 2. The translation problem — and why it's already solved here

Historically the blocker was format mismatch: Claude Code emits Anthropic `/v1/messages`,
Ollama exposed only `/api/chat` (native) and `/v1/chat/completions` (OpenAI-compatible). So a
**translation shim** sat in between. The known options:

| Option | What it is | Status |
|---|---|---|
| **Ollama native Anthropic API** | Ollama ≥ 0.14.0 (Jan 2026) serves `/v1/messages` itself | **Preferred. No shim.** |
| **LiteLLM proxy** | Gateway exposing `/v1/messages`, translating to any backend incl. Ollama | Works; heavier (auth, logging, teams) — <https://docs.litellm.ai/docs/anthropic_unified/> |
| **claude-code-router** (`@musistudio/claude-code-router`) | Local proxy with per-task model routing | Works; requires `npm i -g` — <https://github.com/musistudio/claude-code-router> (see also <https://polyskill.ai/blog/claude-code-router>) |
| **claude-code-proxy / anthropic-proxy shims** | Standalone Anthropic→OpenAI translators | Work; now largely redundant — <https://github.com/fuergaosi233/claude-code-proxy> |

**On this machine the shim is unnecessary.** The installed Ollama is **v0.30.0**, which serves
the Anthropic Messages API natively. Verified read-only:

```text
$ curl -s localhost:11434/api/version
{"version":"0.30.0"}

$ curl -s -X POST localhost:11434/v1/messages -d \
  '{"model":"qwen2.5-coder:7b","max_tokens":16,"messages":[{"role":"user","content":"say OK"}]}'
{"id":"msg_c91...","type":"message","role":"assistant",
 "content":[{"type":"text","text":"OK"}],"stop_reason":"end_turn",
 "usage":{"input_tokens":7,"output_tokens":2}}
```

That's a correctly-shaped Anthropic response (`msg_…` id, `content[].type:"text"`,
`stop_reason`, `usage`). **Streaming** also works with proper Anthropic SSE events
(`message_start` → `content_block_start` → `content_block_delta` …), which Claude Code requires:

```text
event: message_start
data: {"type":"message_start","message":{"id":"msg_3f7...","content":[],...}}
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"1"}}
```

The LAAM proxy on `:11435` (same Ollama v0.30.0) passes these through identically.

Sources: Ollama native Anthropic support and setup steps —
<https://docs.ollama.com/integrations/claude-code> ·
<https://medium.com/@luongnv89/run-claude-code-on-local-cloud-models-in-5-minutes-ollama-openrouter-llama-cpp-6dfeaee03cda>

---

## 3. What Claude Code actually needs from a backend — and where 7B breaks

Claude Code is an **agent**, not an autocomplete. To function it needs, per turn: long context,
streaming, system-prompt handling, and — critically — **structured `tool_use` output**: the
model must return a `content` block of `type:"tool_use"` with a `name` and a JSON `input`, and
set `stop_reason:"tool_use"`, so the CLI can execute the tool (read file, edit, run bash) and
feed back a `tool_result`. Every multi-step edit depends on this loop.

Streaming ✅, context ✅ (32K loaded here, see §5), system prompts ✅. **Tool use is the
problem.** Tested live with a real tool definition:

```text
$ curl -s -X POST localhost:11434/v1/messages -d '{
   "model":"qwen2.5-coder:7b","max_tokens":256,
   "messages":[{"role":"user","content":"What is the weather in Paris? Use the get_weather tool."}],
   "tools":[{"name":"get_weather","description":"...",
             "input_schema":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}]}'

{"type":"message","role":"assistant",
 "content":[{"type":"text",
             "text":"{\n \"name\": \"get_weather\",\n \"arguments\": {\"city\": \"Paris\"}}"}],
 "stop_reason":"end_turn"}
```

**This is the core failure.** The model "knew" to call the tool, but emitted the call as
**plain text inside a `text` block** with `stop_reason:"end_turn"` — not as a `tool_use` block
with `stop_reason:"tool_use"`. Claude Code would see literal text, not an executable tool call,
and the agent loop stalls. (Same result through the LAAM proxy.)

This is a known weak spot of small models: even when Ollama advertises a `tools` capability for
`qwen2.5-coder:7b`, the 7B's *generation* doesn't reliably conform to the structured tool-call
protocol the harness expects. Larger / agentically-trained models (Qwen3-Coder family, Claude
Sonnet) emit the structured block far more reliably — that's much of what "agentic training"
buys. With 7B you get sporadic, malformed, or text-leaked tool calls, which an agent can't
drive a multi-file edit on.

Sources: Anthropic tool-use / `tool_use` block contract —
<https://docs.litellm.ai/docs/anthropic_unified/> · agentic-coding gap between small and
trained models — <https://qwenlm.github.io/blog/qwen3-coder/>

---

## 4. POC

**No `/tmp` shim was needed or written.** A standalone Anthropic→Ollama Node shim would only
have proven the *translation mechanism* — and the installed **Ollama 0.30.0 already performs
that translation natively**, which the live `curl`s in §2–§3 demonstrate end-to-end against the
real local stack (text, streaming SSE, and tool-call attempts). Those curls are a stronger,
more honest proof than a toy shim: they exercise the exact path Claude Code would use. So the
POC reduces to "the mechanism works; the model's *output quality* does not," which the §3 tool
test shows directly. Writing a redundant shim was skipped deliberately.

---

## 5. Honest assessment: 7B-local to implement code for LAAM

**Mechanism:** solid. Wiring Claude Code to local Qwen2.5-Coder 7B is a 3-env-var change, no
shim, on this machine today.

**Capability for real agentic coding in LAAM:** not there yet. Concrete limitations:

- **Tool-call reliability (the dealbreaker).** Demonstrated above: 7B emits tool calls as text,
  not structured `tool_use`. Claude Code's read→edit→run→verify loop needs reliable structured
  tool calls every turn. 7B will frequently stall, malform args, or "describe" an edit instead
  of making it. This alone makes it unfit for unattended multi-file work.
- **Context window.** Ollama loaded these models at **32K** (`context_length:32768`), not the
  128K the model card claims. Ollama/Claude-Code guidance recommends **≥64K** for Claude Code;
  the LAAM repo's own system prompts + file context routinely blow past 32K, causing truncation
  and lost instructions. (128K is reachable but needs a custom Modelfile and a lot more VRAM.)
- **Multi-file reasoning.** 7B holds far less of a codebase "in mind"; cross-file refactors,
  tracing call sites, and keeping an architecture coherent degrade sharply vs Sonnet/Opus.
- **Hallucinated APIs.** Small coders invent function signatures, config keys, and library
  methods more often, and self-correct less — costly in an agent that then acts on the mistake.
- **Instruction-following under pressure.** 7B drifts from multi-constraint system prompts
  (style rules, "edit don't recreate", safety scopes) more than frontier models.

**What 7B *is* genuinely good at** (its benchmarks are real — HumanEval ≈ 88%, MBPP ≈ 83% for
the 7B-Instruct): single-file generation, boilerplate, FIM/autocomplete (note the `insert`
capability Ollama reports), explaining a snippet, a localized bug fix you'll review. That's
strong, fast, free, fully offline — but it's *assistant*, not *autonomous agent*, territory.

**When is local worth it?**
- ✅ Offline / air-gapped / strict data-privacy requirements where code must not leave the box.
- ✅ Zero-marginal-cost autocomplete and one-shot snippet generation (use Ollama/Continue
  directly — you don't even need the Claude Code agent harness for this).
- ✅ Experimenting with the routing mechanism, or burning through cheap "background" tasks.
- ❌ Driving Claude Code agentically on a real multi-file project like LAAM. Not in 2026 at 7B.

**If you still want a local agent:** step up the model, not the plumbing. The Ollama×Claude-Code
docs recommend ≥64K context and agentically-trained coders; the **14B already on this box** is a
meaningfully better floor, and the Qwen3-Coder family is the class that benchmarks "comparable
to Claude Sonnet among open models" on agentic tool-use. But even those trail Claude on hard
LAAM-style reasoning, and they need real VRAM. The honest recommendation: keep Claude
(Sonnet/Opus) for agentic implementation in LAAM; use local 7B/14B for offline autocomplete and
throwaway snippets.

### Sources
- Ollama × Claude Code: <https://docs.ollama.com/integrations/claude-code>
- `ANTHROPIC_BASE_URL` behavior: <https://fazm.ai/blog/route-claude-api-through-custom-endpoint-anthropic-base-url>
- Claude Code custom-endpoint request: <https://github.com/anthropics/claude-code/issues/216>
- LiteLLM Anthropic `/v1/messages`: <https://docs.litellm.ai/docs/anthropic_unified/>
- claude-code-router: <https://github.com/musistudio/claude-code-router> · <https://polyskill.ai/blog/claude-code-router>
- claude-code-proxy: <https://github.com/fuergaosi233/claude-code-proxy>
- Local-LLM proxy approaches: <https://medium.com/@luongnv89/run-claude-code-on-local-cloud-models-in-5-minutes-ollama-openrouter-llama-cpp-6dfeaee03cda>
- Qwen2.5-Coder family + benchmarks: <https://qwenlm.github.io/blog/qwen2.5-coder-family/> · tech report <https://arxiv.org/pdf/2409.12186>
- Qwen2.5-Coder 7B context/spec: <https://openrouter.ai/qwen/qwen2.5-coder-7b-instruct>
- Agentic-coding gap (Qwen3-Coder vs Sonnet): <https://qwenlm.github.io/blog/qwen3-coder/>
