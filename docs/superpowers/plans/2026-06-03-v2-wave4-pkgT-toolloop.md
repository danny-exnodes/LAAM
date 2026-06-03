# Wave 4 — Package W4-T: chat tool-calling loop

> **For agentic workers:** sub-plan of `2026-06-03-v2-wave4-connectors.md` (Package W4-T). TDD, single owner.

**Goal:** When a user has connected connectors, let the chat model invoke their tools before streaming the final answer; when no connectors are connected, behave byte-for-byte as today.

**Architecture:** A pure-ish helper `runToolRounds(messages, tools, deps)` runs a bounded (max 4) non-streaming Ollama tool-calling loop. The route calls `chatTools(userId)` before the existing streaming request; if tools exist it runs the loop to augment `messages`, then performs the unchanged streaming `fetch` + persistence with the augmented history. `deps = { callOllama, execute }` so the loop is unit-testable with mocks.

**Tech Stack:** Next.js 16 route handler, `@/lib/connectors` (chatTools/execute — locked signatures), vitest mocks.

---

## Constraints (from team-lead brief)
- MODIFY only `v2/src/app/api/chat/route.ts` (+ a new/extended test). Don't break existing `route.test.ts` assertions.
- `tools.length === 0` → identical to current path (no extra Ollama call).
- Reuse `buildOllamaPayload`; don't rewrite streaming/persistence.
- Tool round-trips need not be persisted (only the final assistant message). DECISION: persist only the final assistant text, as today — tool round messages are ephemeral in-memory only.
- Run only `cd v2 && npx vitest run src/app/api/chat`.

## File structure
- `v2/src/app/api/chat/route.ts` — add `runToolRounds` helper + wire into POST.
- `v2/src/app/api/chat/tool-loop.test.ts` — NEW unit tests for the helper.
- `v2/src/app/api/chat/route.test.ts` — UNCHANGED (existing buildOllamaPayload tests must still pass).

## Helper contract
```ts
type ToolRoundsDeps = {
  callOllama: (messages: ChatMessage[], tools: ConnectorTool[]) => Promise<OllamaChatResponse>;
  execute: (toolName: string, args: unknown) => Promise<unknown>;
};
// Returns the (possibly tool-augmented) message list to feed the final streaming request.
async function runToolRounds(
  messages: ChatMessage[],
  tools: ConnectorTool[],
  deps: ToolRoundsDeps,
  maxRounds = 4,
): Promise<ChatMessage[]>
```
- Loop up to `maxRounds`. Each round: `callOllama(convo, tools)` (non-stream). If `message.tool_calls` present AND not the final allowed round, append the assistant tool_calls message + one `{role:"tool", content: JSON.stringify(result)}` per executed call, then continue. Otherwise return `convo`.
- Final round (i === maxRounds-1) must NOT expose tool_calls handling — break so the model produces text. (Matches v1: `round(i < 3)` and `i < 3` guards.)
- The returned `convo` is what the streaming request sends; the system message stays at the front (passed in from buildOllamaPayload.messages).

## Tasks (TDD)

### Task 1 — helper unit tests (red)
- [ ] Write `tool-loop.test.ts`: import `runToolRounds` from `./route`. Mock deps.
  - test A: one tool_call → execute → tool result appended → second round returns no tool_calls → returned messages contain the assistant tool_calls msg + a `{role:"tool"}` msg with the executed result; `execute` called once with name+args; `callOllama` called twice.
  - test B: no tool_calls on first round → returns messages unchanged; `execute` not called; `callOllama` called once.
  - test C: model keeps emitting tool_calls → bounded at maxRounds `callOllama` calls (no infinite loop); final round requested without tools.
- [ ] Run `cd v2 && npx vitest run src/app/api/chat` → FAIL (runToolRounds not exported).

### Task 2 — implement helper (green)
- [ ] Add `runToolRounds` + types to `route.ts`. Run tests → PASS.

### Task 3 — wire into POST (surgical)
- [ ] After building `payload`, before the streaming `fetch`: `const tools = await chatTools(userId)`. If `tools.length`, build `deps.callOllama` (POST `${OLLAMA_URL}/api/chat` with `{model, messages, tools, stream:false}`) + `deps.execute = (n,a)=>execute(userId,n,a)`, run `runToolRounds(payload.messages, tools, deps)`, and replace `payload.messages` with the result. If `chatTools` throws or returns empty, fall through to the unchanged path.
- [ ] Stub `@/lib/connectors` in route.test.ts? NO — route.test.ts only imports buildOllamaPayload; the module import of connectors must not break test load. Add `vi.mock("@/lib/connectors")` to tool-loop.test.ts only if needed; buildOllamaPayload test stays green because the helper is pure and imports are tree-loaded once. Verify both test files pass.
- [ ] Run `cd v2 && npx vitest run src/app/api/chat` → PASS.

## Success criteria
- `npx vitest run src/app/api/chat` green (existing + new).
- No-connector path: no extra Ollama call, identical streaming + persistence.
- Helper is bounded (no infinite loop) and unit-tested with mocked Ollama + execute.
