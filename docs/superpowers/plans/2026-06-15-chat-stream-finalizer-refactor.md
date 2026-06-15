# Chat Stream/Finalizer Refactor — Implementation Plan

> **For agentic workers:** executed INLINE this session (user pre-authorized to E2E). Steps use checkbox (`- [ ]`) tracking.

**Goal:** Remove the 4-way stream-completion duplication in `src/app/api/chat/route.ts` by extracting an `ollamaStream` generator (mirroring `claudeStream`) + a single `finalizeTurn` finalizer, and close the documented gap where confirmed writes are not persisted to `chat_tool_call`.

**Architecture:** Composition, not a provider interface. Both providers already (Claude) / will (Ollama) expose `AsyncGenerator<{delta?,usage?}>`. A shared `finalizeTurn(controller, enc, convId, opts)` owns the persist-assistant → emit-trailing-frames → persist-tool-turns → updatedAt → close sequence + the F1 write-claim guard. Provider-specific *error* handling (Claude coded-notice+persist vs Ollama plain-message) stays in the callers — it is test-locked and intentionally divergent.

**Tech Stack:** Next.js 16 route handler, ReadableStream, Drizzle, Vitest. No new deps.

**Scope (from audit T1–T6):** R1 ollamaStream · R2 finalizeTurn (absorbs F1-guard dedup = old T3-guard) · R4 confirm-write tool-turn persist (T4) · R5 stale QW-1 comment (T5). **Deferred w/ rationale:** formal `ChatProvider` interface (T2 — YAGNI per `decisions/claude-provider-and-subscription.md`, generator seam gets 80%), parse-convo-twice (T3 — micro-opt, adds coupling), MODEL default (T6 — cosmetic, test-coupled, prod overrides via env).

**Safety net:** `src/app/api/chat/route.test.ts` is a characterization suite (R0 tool-loop error, C1 Claude MVS ×4, C1 hardening ×5, vision, RBAC). It MUST stay green through every step — it is the behavior-preservation oracle.

---

## File Structure

- **Create** `src/lib/llm/ollama.ts` — `ollamaStream(res)` generator (NDJSON → `{delta?,usage?}`). Pure of DB/route concerns.
- **Create** `src/lib/llm/ollama.test.ts` — unit tests for the generator.
- **Modify** `src/app/api/chat/route.ts` — add `finalizeTurn`; rewrite the 4 stream paths to use `ollamaStream`/`claudeStream` + `finalizeTurn`; R4 in `handleConfirm`; R5 comment.
- **Modify** `src/app/api/chat/route.test.ts` — add R4 test (confirmed Ollama write persists a `chat_tool_call` row).

---

## Task R1: `ollamaStream` generator

**Files:** Create `src/lib/llm/ollama.ts`, Test `src/lib/llm/ollama.test.ts`

- [ ] **Step 1 — failing test.** Feed a fake `Response` whose body yields two NDJSON chunks; assert deltas then a final usage.

```ts
import { describe, expect, test } from "vitest";
import { ollamaStream } from "./ollama";

function resFrom(chunks: string[]): Response {
  let i = 0;
  return { body: { getReader: () => ({ read: async () =>
    i < chunks.length ? { done: false, value: new TextEncoder().encode(chunks[i++]) } : { done: true, value: undefined } }) } } as unknown as Response;
}

describe("ollamaStream", () => {
  test("yields each content delta then a final usage from done line", async () => {
    const res = resFrom([
      JSON.stringify({ message: { content: "chào " } }) + "\n",
      JSON.stringify({ message: { content: "bạn" }, done: true, prompt_eval_count: 7, eval_count: 3 }) + "\n",
    ]);
    const out: { delta?: string; usage?: { in: number; out: number } }[] = [];
    for await (const ev of ollamaStream(res)) out.push(ev);
    expect(out.filter((e) => e.delta).map((e) => e.delta)).toEqual(["chào ", "bạn"]);
    expect(out.at(-1)).toEqual({ usage: { in: 7, out: 3 } });
  });

  test("tolerates a delta split across read() chunks (partial JSON line)", async () => {
    const line = JSON.stringify({ message: { content: "x" }, done: true, prompt_eval_count: 1, eval_count: 1 }) + "\n";
    const res = resFrom([line.slice(0, 10), line.slice(10)]);
    const out: { delta?: string; usage?: { in: number; out: number } }[] = [];
    for await (const ev of ollamaStream(res)) out.push(ev);
    expect(out.filter((e) => e.delta).map((e) => e.delta)).toEqual(["x"]);
    expect(out.at(-1)).toEqual({ usage: { in: 1, out: 1 } });
  });

  test("emits usage 0/0 when no done line arrives (always-emit Ollama semantics)", async () => {
    const res = resFrom([JSON.stringify({ message: { content: "hi" } }) + "\n"]);
    const out: { delta?: string; usage?: { in: number; out: number } }[] = [];
    for await (const ev of ollamaStream(res)) out.push(ev);
    expect(out.at(-1)).toEqual({ usage: { in: 0, out: 0 } });
  });
});
```

- [ ] **Step 2 — run, expect FAIL** (`ollamaStream` undefined): `npx vitest run src/lib/llm/ollama.test.ts`
- [ ] **Step 3 — implement.**

```ts
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
```

- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit** `feat(chat): extract ollamaStream generator (mirror claudeStream shape)`

---

## Task R2: `finalizeTurn` + rewrite the 4 stream paths

**Files:** Modify `src/app/api/chat/route.ts`

`finalizeTurn` owns: F1 guard (when `guard` present) → persist assistant (id only when `persist`) → emit `leadingFrames` + tokens (when `emitTokens`) → persist tool turns (when `persist.toolTurns`) → updatedAt → close. `emitTokens` = include tokens in BOTH the assistant insert and the trailing frame (Ollama: always true; Claude: gotUsage).

- [ ] **Step 1 — add `finalizeTurn`** (near the other stream helpers):

```ts
import { ollamaStream } from "@/lib/llm/ollama";
import type { ToolTurnRow } from "@/lib/agent/persist"; // (extractToolTurns return type)

// Shared completion finalizer for every /api/chat stream path (main Ollama, main
// Claude, resume Ollama, resume Claude). Owns: F1 write-claim guard → persist
// assistant → emit trailing frames (leading + tokens) → persist tool turns →
// updatedAt → close. emitTokens gates BOTH the persisted tokensIn/Out and the
// {t:"tokens"} frame (Claude omits both when usage never arrived; Ollama always
// emits). Tool-turn persist sits OUTSIDE the if(full) block with a null FK when
// the completion was empty (union of the old main + resume behaviors; all tested
// paths have non-empty completions so observable output is unchanged).
async function finalizeTurn(
  controller: ReadableStreamDefaultController<Uint8Array>,
  enc: TextEncoder,
  convId: string,
  opts: {
    full: string;
    tokensIn: number;
    tokensOut: number;
    emitTokens: boolean;
    guard?: { writeBacked: boolean; lang: string };
    persist?: { assistantMsgId: string; toolTurns: ToolTurnRow[] };
    leadingFrames: ChatFrame[];
  },
): Promise<void> {
  const send = (s: string) => {
    try { controller.enqueue(enc.encode(s)); } catch { /* client aborted */ }
  };
  let outText = opts.full;
  // F1 (Rule 13): on a write-intent turn the live tokens were withheld; vet the
  // buffered completion and emit the (possibly rewritten) text exactly once.
  if (opts.guard && opts.full) {
    const g = guardWriteClaim(opts.full, { writeBacked: opts.guard.writeBacked, lang: opts.guard.lang });
    outText = g.text;
    if (g.blocked) console.warn("[chat] F1 guard: blocked unbacked write-success claim");
    send(outText);
  }
  if (opts.full) {
    try {
      await db.insert(chatMessages).values({
        ...(opts.persist ? { id: opts.persist.assistantMsgId } : {}),
        conversationId: convId,
        role: "assistant",
        content: outText,
        ...(opts.emitTokens ? { tokensIn: opts.tokensIn, tokensOut: opts.tokensOut } : {}),
      });
    } catch (e) {
      console.error("[chat] persist assistant failed (fail-soft)", e);
    }
    try {
      const frames: ChatFrame[] = [
        ...opts.leadingFrames,
        ...(opts.emitTokens ? [{ t: "tokens", i: opts.tokensIn, o: opts.tokensOut } as ChatFrame] : []),
      ];
      for (const f of frames) controller.enqueue(enc.encode(encodeFrame(f)));
    } catch {
      /* client aborted */
    }
  }
  if (opts.persist && opts.persist.toolTurns.length) {
    try {
      await db.insert(chatToolCalls).values(
        opts.persist.toolTurns.map((tt) => ({
          conversationId: convId,
          messageId: opts.full ? opts.persist!.assistantMsgId : null,
          seq: tt.seq,
          name: tt.name,
          args: tt.args,
          result: tt.result,
          ok: tt.ok,
          bytes: tt.bytes,
        })),
      );
    } catch (e) {
      console.error("[chat] persist tool turns failed (fail-soft)", e);
    }
  }
  try {
    await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, convId));
  } catch {
    /* ignore */
  }
  controller.close();
}
```

- [ ] **Step 2 — R2a: rewrite `streamOllama` (resume path)** to consume `ollamaStream` + `finalizeTurn`. Replace the whole `new ReadableStream({...})` body:

```ts
function streamOllama(
  ollamaRes: Response,
  convId: string,
  opts: {
    persist?: { toolTurns: ToolTurnRow[]; assistantMsgId: string };
    frames?: ChatFrame[];
  } = {},
): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let tokensIn = 0;
      let tokensOut = 0;
      try {
        for await (const ev of ollamaStream(ollamaRes)) {
          if (ev.delta) {
            full += ev.delta;
            try { controller.enqueue(enc.encode(ev.delta)); } catch { /* aborted */ }
          }
          if (ev.usage) { tokensIn = ev.usage.in; tokensOut = ev.usage.out; }
        }
      } finally {
        await finalizeTurn(controller, enc, convId, {
          full, tokensIn, tokensOut, emitTokens: true,
          persist: opts.persist,
          leadingFrames: opts.frames ?? [],
        });
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-conversation-id": convId, "cache-control": "no-cache" },
  });
}
```

Run `npx vitest run src/app/api/chat` → all green.

- [ ] **Step 3 — R2b: rewrite `streamClaudeCompletion`** to consume `claudeStream` + `finalizeTurn`, keeping the pre-delta "Đã thực hiện hành động" notice in the catch:

```ts
function streamClaudeCompletion(
  convId: string,
  model: string,
  messages: ChatMessage[],
  frames: ChatFrame[],
  lang: string,
  signal?: AbortSignal,
  persist?: { assistantMsgId: string; toolTurns: ToolTurnRow[] }, // R4: confirmed write tool-turn
): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let tokensIn = 0;
      let tokensOut = 0;
      let gotUsage = false;
      try {
        for await (const ev of claudeStream({ model, messages, signal })) {
          if (ev.delta) {
            full += ev.delta;
            try { controller.enqueue(enc.encode(ev.delta)); } catch { /* aborted */ }
          }
          if (ev.usage) { gotUsage = true; tokensIn = ev.usage.in; tokensOut = ev.usage.out; }
        }
      } catch (e) {
        // Write ĐÃ thực thi trước khi tới đây → user PHẢI biết (mất tường thuật ≠
        // mất hành động); không bao giờ đóng stream 0 byte im lặng (Rule 12).
        if (!full) {
          const code = e instanceof ClaudeUnavailableError ? e.code : "api";
          console.error(`[chat] claude resume failed before first delta (conv=${convId}, code=${code})`, e);
          full = `Đã thực hiện hành động nhưng không tạo được phản hồi. ${claudeErrText(lang, code)}`;
          try { controller.enqueue(enc.encode(full)); } catch { /* aborted */ }
        } else {
          console.error(`[chat] claude resume stream failed (conv=${convId})`, e);
        }
      }
      await finalizeTurn(controller, enc, convId, {
        full, tokensIn, tokensOut, emitTokens: gotUsage,
        persist, leadingFrames: frames,
      });
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-conversation-id": convId, "cache-control": "no-cache" },
  });
}
```

Run `npx vitest run src/app/api/chat` → all green (CRITICAL 1b resume, MINOR 4 still pass).

- [ ] **Step 4 — R2c: rewrite the Claude branch in `streamMainTurn`** (lines ~437-531). Keep the pre-delta error block (persist coded notice + close + return) UNCHANGED; replace only the finalize tail (lines ~490-530) with `finalizeTurn`:

```ts
        if (reqSignal?.aborted) console.warn(`[chat] client aborted stream (conv=${convId})`);
        await finalizeTurn(controller, enc, convId, {
          full, tokensIn, tokensOut, emitTokens: gotUsage,
          guard: guardWrites ? { writeBacked: false, lang } : undefined,
          leadingFrames: proactive.length ? [proactiveFrame(proactive)] : [],
        });
        return;
```

(The `enc` in `streamMainTurn` already exists at the top of `start`.) Run `npx vitest run src/app/api/chat` → green.

- [ ] **Step 5 — R2d: rewrite the Ollama completion tail in `streamMainTurn`** (lines ~669-767). Keep the completion `fetch` + `!ok` guards (their plain error messages are path-specific). Replace the read loop + `finally` with:

```ts
      const assistantMsgId = crypto.randomUUID();
      let full = "";
      let tokensIn = 0;
      let tokensOut = 0;
      try {
        for await (const ev of ollamaStream(ollamaRes)) {
          if (ev.delta) {
            full += ev.delta;
            // Withhold live tokens on write-intent turns; finalizeTurn emits the
            // vetted text once so an unbacked success claim never displays.
            if (!guardWrites) { try { controller.enqueue(enc.encode(ev.delta)); } catch { /* aborted */ } }
          }
          if (ev.usage) { tokensIn = ev.usage.in; tokensOut = ev.usage.out; }
        }
      } finally {
        if (reqSignal?.aborted) console.warn(`[chat] client aborted stream (conv=${convId})`);
        await finalizeTurn(controller, enc, convId, {
          full, tokensIn, tokensOut, emitTokens: true,
          guard: guardWrites ? { writeBacked, lang } : undefined,
          persist: { assistantMsgId, toolTurns },
          leadingFrames: [
            ...(cites.length ? [{ t: "cite", names: cites } as ChatFrame] : []),
            ...(proactive.length ? [proactiveFrame(proactive)] : []),
          ],
        });
      }
```

(Add `enc` at top of `streamMainTurn`'s `start` if not already there — it is: `const enc = new TextEncoder()`.) Delete the now-unused inline `decoder`/`buf` and the old `streamOllama`-duplicated loop. Run `npx vitest run src/app/api/chat` → green.

- [ ] **Step 6 — typecheck** `npx tsc --noEmit` (exit 0) and full chat-surface tests `npx vitest run src/app/api/chat src/lib/chat src/lib/agent src/components/chat` (≥389 green).
- [ ] **Step 7 — commit** `refactor(chat): single finalizeTurn for all 4 stream paths (dedup persist/frames/guard)`

---

## Task R4: persist confirmed-write tool turns

**Files:** Modify `src/app/api/chat/route.ts` (`handleConfirm`), Test `src/app/api/chat/route.test.ts`

- [ ] **Step 1 — failing test** (append to the `C1 review hardening` describe or a new `R4` describe). A sealed Ollama-model write, confirmed, narrated by a mocked Ollama stream → assert a `chat_tool_call` row was inserted with the tool name.

```ts
describe("R4 — confirmed write persists chat_tool_call", () => {
  test("Ollama confirm → tool turn row inserted (name + ok)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const captured = { values: [] as unknown[] };
    // select #1 = history (handleConfirm); audit nonce-window selects → [].
    _db = fakeChainDb(captured, [[{ role: "user", content: "tạo task" }, { role: "assistant", content: 'Tạo "X".' }]]);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // resume narration = a one-line Ollama NDJSON stream.
    const ndjson = JSON.stringify({ message: { content: "Đã tạo." }, done: true, prompt_eval_count: 1, eval_count: 1 }) + "\n";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => { let s = false; return { read: async () => s ? { done: true, value: undefined } : (s = true, { done: false, value: new TextEncoder().encode(ndjson) }) }; } },
    }));
    const now = Date.now();
    const token = sealPendingWrite({
      v: 1, name: "demo_create_task", args: { title: "X" },
      conversationId: "c1", userId: "u1", iat: now, exp: now + 60_000,
      nonce: crypto.randomUUID(), model: "qwen3-vl:8b-instruct-q8_0",
    });
    try {
      const res = await POST(new Request("http://x/api/chat", {
        method: "POST", headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
        body: JSON.stringify({ confirm: { token, approve: true } }),
      }));
      await res.text();
      // chatToolCalls insert is an ARRAY of rows; find the one carrying our tool.
      const toolRows = captured.values
        .filter((v): v is { name?: string }[] => Array.isArray(v))
        .flat()
        .filter((r) => r && typeof r === "object" && "name" in r);
      expect(toolRows.some((r) => r.name === "demo_create_task")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      errSpy.mockRestore();
      _db = {};
    }
  });
});
```

- [ ] **Step 2 — run, expect FAIL** (no tool-turn row yet): `npx vitest run src/app/api/chat -t "confirmed write persists"`
- [ ] **Step 3 — implement** in `handleConfirm`, after `outcome.status === "executed"`:

```ts
  // R4: persist the confirmed write as a chat_tool_call row (was a documented gap —
  // the executed write surfaced a trace frame but never landed in the table). The
  // last two resume messages are [assistant{tool_calls:[write]}, tool{result}].
  const confirmBaseLen = Math.max(0, outcome.messages.length - 2);
  const confirmPersist = {
    assistantMsgId: crypto.randomUUID(),
    toolTurns: extractToolTurns(outcome.messages, confirmBaseLen),
  };
```

Then thread it through both completion calls:
- Claude: `return streamClaudeCompletion(convId, confirmModel, outcome.messages, confirmFrames, lang, req.signal, confirmPersist);`
- Ollama: `return streamOllama(ollamaRes, convId, { persist: confirmPersist, frames: confirmFrames });`

- [ ] **Step 4 — run, expect PASS**; then `npx vitest run src/app/api/chat` (all green — CRITICAL 1b resume must still pass: it errors pre-delta so `full` empty → tool-turn persisted with null FK, no assertion conflict).
- [ ] **Step 5 — commit** `fix(chat): persist confirmed-write tool turn to chat_tool_call (close documented gap)`

---

## Task R5: fix stale QW-1 comment

**Files:** Modify `src/app/api/chat/route.ts` (~line 350)

- [ ] **Step 1 — edit** the misleading comment (QW-1 grouping was reverted; only the harmless `{name,kind}` signature was kept):

```ts
        // Pass {name, kind} per tool. (QW-1 đã thử render-có-nhóm trong context.ts
        // nhưng REVERT — benefit chỉ ở scale, chưa đo được; chỉ giữ lại signature
        // {name,kind}, vô hại. Xem decisions/chat-tool-selection.md.)
```

- [ ] **Step 2 — typecheck** `npx tsc --noEmit` (exit 0). No behavior change → no test delta.
- [ ] **Step 3 — commit** `docs(chat): correct stale QW-1 comment in route`

---

## Final verification (before E2E handoff)

- [ ] `npx tsc --noEmit` → exit 0
- [ ] Full suite `npx vitest run` → green, count ≥ baseline + new R1/R4 tests
- [ ] `git log --oneline` shows R1, R2, R4, R5 commits
- [ ] Self-review diff: each path's error semantics preserved (Claude coded-notice+persist; Ollama plain-message no-persist); frame ORDER unchanged (cite → proactive → tokens); `route.ts` line count materially reduced.
- [ ] **STOP — report to user for E2E** (dev server is user-hosted; E2E via Claude-in-Chrome needs their go-ahead).

## Self-Review (against the audit)

1. **Coverage:** T1 → R1+R2; T4 → R4; T5 → R5. T2/T3/T6 explicitly deferred with rationale (top of doc). ✓
2. **Placeholders:** none — every step has concrete code/commands. ✓
3. **Type consistency:** `ToolTurnRow` is the existing export from `persist.ts` (return elem of `extractToolTurns`); `finalizeTurn` opts reused verbatim across R2a–R2d + R4; `ChatFrame` from `frames.ts`. `emitTokens` semantics identical everywhere. ✓
