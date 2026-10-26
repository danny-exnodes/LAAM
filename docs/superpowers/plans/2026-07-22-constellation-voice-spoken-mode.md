# Constellation Voice Spoken-Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Jarvis (`/constellation`) generate spoken-register replies — short, no markdown, no read-aloud UUIDs — by threading a `mode: "voice"` flag from the constellation client through `/api/chat` into `buildSystemPrompt`.

**Architecture:** Add one optional `mode` field to the chat request body. The constellation client always sends `mode: "voice"`. On the server, `buildSystemPrompt` swaps the visual `RENDER_GUIDE` for a new `VOICE_GUIDE` when `mode === "voice"`; every other part of the prompt (base/persona, date, language hint, tool clause) is unchanged. Text chat, absent-`mode`, and `system`-override requests behave byte-for-byte as before.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-22-constellation-voice-spoken-mode-design.md`

## Global Constraints

- **Backward compatibility is mandatory.** `mode` absent or `"text"` → `buildSystemPrompt` output is byte-for-byte identical to today. The existing `context.test.ts` cases (which call `buildSystemPrompt` without `mode` and assert ```` ```chart ```` / ```` ```map ```` are present) MUST stay green unchanged.
- **Prompt language is Vietnamese** to match `BASE` / `RENDER_GUIDE`. Reply language stays governed by `LANG_HINT` (vi/en/zh) — `VOICE_GUIDE` never overrides it.
- **Voice mode changes tone/format only, not capability.** The tool clause (`context.ts:50-58`) stays intact — Jarvis must still call tools for real data.
- **Surgical changes (AGENTS Rule 3).** Touch only the four files below. No refactoring of adjacent code.
- **`mode` is a string-literal union `"voice" | "text"`**, not a boolean or enum (TS coding-style: prefer literal unions).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/agent/context.ts` | System-prompt composition | Add `mode?` param; add `VOICE_GUIDE`; swap `RENDER_GUIDE`→`VOICE_GUIDE` when voice |
| `src/lib/agent/context.test.ts` | Prompt unit tests | Add voice-mode + regression cases |
| `src/app/api/chat/route.ts` | Chat endpoint | Add `mode` to `ChatBody`; thread to **both** `buildSystemPrompt` call sites (main turn `:435`, `handleConfirm` `:1220`) |
| `src/components/constellation/useConstellationChat.ts` | Constellation client hook | Inject `mode: "voice"` in `consume` (covers `send` + `confirm`) |
| `src/components/constellation/useConstellationChat.test.ts` | Hook unit tests | Assert POST body carries `mode: "voice"` for send + confirm |

---

## Task 1: Voice-mode system prompt in `context.ts`

**Files:**
- Modify: `src/lib/agent/context.ts`
- Test: `src/lib/agent/context.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildSystemPrompt(input: { lang: string; now: number; tools: {name;kind}[] | string[]; base?: string; mode?: "voice" | "text" }): string`. New optional field `mode`; default (absent) behaves as `"text"`. When `mode === "voice"` the returned prompt contains `VOICE_GUIDE` and omits `RENDER_GUIDE`; otherwise unchanged.

- [ ] **Step 1: Write the failing tests**

Add these cases inside the existing `describe("buildSystemPrompt", …)` block in `src/lib/agent/context.test.ts` (reuse the existing `const now = Date.UTC(2026, 5, 4)`):

```ts
test("voice mode: dùng VOICE_GUIDE, bỏ hợp đồng render trực quan (chart/map)", () => {
  const p = buildSystemPrompt({ lang: "vi", now, tools: [], mode: "voice" });
  // Voice guide markers
  expect(p).toContain("giọng nói");        // "Đây là hội thoại bằng giọng nói…"
  expect(p).toContain("KHÔNG đọc ID");     // drop identifiers rule
  // Visual render contract must be gone — meaningless for TTS
  expect(p).not.toContain("```chart");
  expect(p).not.toContain("```map");
});

test("voice mode: giữ tiếng Việt (LANG_HINT không bị voice ghi đè) và giữ khối tool", () => {
  const p = buildSystemPrompt({
    lang: "vi",
    now,
    tools: [{ name: "laam_list_agents", kind: "read" }],
    mode: "voice",
  });
  expect(p).toContain("tiếng Việt");        // LANG_HINT preserved
  expect(p).toContain("các công cụ sau");   // tool clause preserved
  expect(p).toContain("laam_list_agents");
});

test("mode 'text' và mode vắng mặt: prompt y hệt nhau (regression backward-compat)", () => {
  const withText = buildSystemPrompt({ lang: "vi", now, tools: [], mode: "text" });
  const withNone = buildSystemPrompt({ lang: "vi", now, tools: [] });
  expect(withText).toBe(withNone);
  // và vẫn giữ hợp đồng render như cũ
  expect(withNone).toContain("```chart");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/agent/context.test.ts`
Expected: the three new tests FAIL (voice branch not implemented — `mode` is ignored, so ````chart` is still present and `giọng nói` is absent). The five pre-existing tests still PASS.

- [ ] **Step 3: Implement the voice branch**

In `src/lib/agent/context.ts`, add the `VOICE_GUIDE` constant just after the `RENDER_GUIDE` constant (after line 28):

```ts
// Voice contract: on /constellation the reply is read aloud by TTS. Generate spoken
// prose, not written markup — no tables/lists/markdown, no read-aloud identifiers,
// summarize long lists. Replaces RENDER_GUIDE (chart/map are visual-only) in voice mode.
const VOICE_GUIDE =
  "Đây là hội thoại bằng giọng nói — câu trả lời của bạn sẽ được đọc thành tiếng. " +
  "Hãy trả lời như đang NÓI chuyện tự nhiên: câu ngắn, mạch lạc, KHÔNG dùng markdown " +
  "(không bảng, không gạch đầu dòng, không tiêu đề, không khối mã). " +
  "KHÔNG đọc ID, UUID, mã băm, mã dài hay đường dẫn — bỏ qua chúng, chỉ nêu khi người dùng hỏi thẳng. " +
  "Ưu tiên ngắn gọn và tóm tắt. Danh sách ngắn thì đọc tự nhiên kiểu \"gồm A, B và C\"; " +
  "nếu danh sách dài, nêu số lượng và vài mục tiêu biểu rồi hỏi người dùng muốn nghe hết hay tìm mục cụ thể. " +
  "Đọc số và ngày tháng theo cách người ta nói, đừng đọc dạng máy trừ khi cần chính xác.";
```

Add `mode` to the `buildSystemPrompt` input type (the object literal at lines 30-37) — insert after `base?: string;`:

```ts
  // Voice surface (/constellation): spoken-register output. Absent → "text" (unchanged).
  mode?: "voice" | "text";
```

Change the final composition line (currently line 60):

```ts
  return [base, `Hôm nay là ${date}.`, langHint, tools, RENDER_GUIDE].filter(Boolean).join(" ");
```

to:

```ts
  const guide = input.mode === "voice" ? VOICE_GUIDE : RENDER_GUIDE;
  return [base, `Hôm nay là ${date}.`, langHint, tools, guide].filter(Boolean).join(" ");
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/agent/context.test.ts`
Expected: all tests PASS (3 new + 5 pre-existing = 8).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/context.ts src/lib/agent/context.test.ts
git commit -m "feat(constellation): voice-mode system prompt (VOICE_GUIDE) in buildSystemPrompt"
```

---

## Task 2: Thread `mode` through `/api/chat`

**Files:**
- Modify: `src/app/api/chat/route.ts` (three spots: `ChatBody` type `:139`, main-turn `buildSystemPrompt` call `:435`, `handleConfirm` `:1196`/`:1220` + its call site `:289`)

**Interfaces:**
- Consumes: `buildSystemPrompt({ …, mode })` from Task 1.
- Produces: the POST handler forwards `body.mode` to `buildSystemPrompt` on the main-turn path, and `rawBody.mode` to `handleConfirm`, which forwards it to its own `buildSystemPrompt`. No exported-signature change other than `handleConfirm` gaining a `mode` parameter (internal, not exported).

> **Why no new unit test here:** this task is pure plumbing — it forwards a value already fully behavior-tested in Task 1. Its correctness is verified by (a) the type-checker, (b) the pre-existing `route.test.ts` staying green (regression: nothing sends `mode`, so behavior is unchanged), and (c) the Task 3 hook test proving the client actually sends `mode`. Adding a full POST-integration test for one forwarded field would be brittle and low-signal (AGENTS Rule 2). Manual smoke is in the final verification section.

- [ ] **Step 1: Add `mode` to `ChatBody`**

In `src/app/api/chat/route.ts`, in the `ChatBody` type (lines 139-152), add after `requestedTool?: …;`:

```ts
  mode?: "voice" | "text"; // /constellation sends "voice" → spoken-register prompt (buildSystemPrompt). Absent → "text".
```

- [ ] **Step 2: Forward `mode` on the main-turn `buildSystemPrompt` call**

At the `buildSystemPrompt({ … })` call (lines 435-448), add a `mode` line inside the object (e.g. after the `tools:` line 445):

```ts
        mode: body.mode,
```

- [ ] **Step 3: Give `handleConfirm` a `mode` parameter and forward it**

The confirm branch is dispatched at line 289 **before** `rawBody` is narrowed to `ChatBody`, so read `mode` straight off `rawBody`. Change the dispatch line:

```ts
  if (isConfirmBody(rawBody)) return handleConfirm(req, rawBody.confirm, userId);
```

to:

```ts
  if (isConfirmBody(rawBody))
    return handleConfirm(req, rawBody.confirm, userId, (rawBody as { mode?: "voice" | "text" }).mode);
```

Change the `handleConfirm` signature (lines 1196-1200) from:

```ts
async function handleConfirm(
  req: Request,
  confirm: { token: string; approve: boolean },
  userId: string,
): Promise<Response> {
```

to:

```ts
async function handleConfirm(
  req: Request,
  confirm: { token: string; approve: boolean },
  userId: string,
  mode?: "voice" | "text", // spoken-register narration of the write result on /constellation
): Promise<Response> {
```

Change its `buildSystemPrompt` call (line 1220) from:

```ts
  const system = buildSystemPrompt({ lang, now, tools: [] });
```

to:

```ts
  const system = buildSystemPrompt({ lang, now, tools: [], mode });
```

- [ ] **Step 4: Verify types and existing tests**

Run: `npm test -- src/app/api/chat/route.test.ts`
Expected: PASS unchanged (no test sends `mode`; behavior is identical).

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(constellation): thread voice mode through /api/chat (main turn + confirm)"
```

---

## Task 3: Send `mode: "voice"` from the constellation client

**Files:**
- Modify: `src/components/constellation/useConstellationChat.ts`
- Test: `src/components/constellation/useConstellationChat.test.ts`

**Interfaces:**
- Consumes: the `mode` field accepted by `/api/chat` from Task 2.
- Produces: every request the hook makes (`send` and `confirm`, both via `consume`) includes `mode: "voice"` in the POST body.

- [ ] **Step 1: Write the failing tests**

Add these two cases to `src/components/constellation/useConstellationChat.test.ts` (reuse the existing `streamResponse` helper):

```ts
it("sends mode:'voice' in the POST body on send", async () => {
  const fetchMock = vi.fn(async () => streamResponse(["ok"]));
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() =>
    useConstellationChat({ onText: () => {}, onPendingWrite: () => {} })
  );
  await act(async () => { await result.current.send({ message: "hi", model: "gemma4:e4b" }); });
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  expect(body.mode).toBe("voice");
});

it("sends mode:'voice' in the POST body on confirm", async () => {
  const fetchMock = vi.fn(async () => streamResponse(["done"]));
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() =>
    useConstellationChat({ onText: () => {}, onPendingWrite: () => {} })
  );
  await act(async () => { await result.current.confirm("TOK", true); });
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  expect(body.mode).toBe("voice");
  expect(body.confirm).toEqual({ token: "TOK", approve: true });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/constellation/useConstellationChat.test.ts`
Expected: the two new tests FAIL (`body.mode` is `undefined`). The two pre-existing tests still PASS.

- [ ] **Step 3: Inject `mode: "voice"` in `consume`**

In `src/components/constellation/useConstellationChat.ts`, in the `consume` callback, change the fetch body (line 36) from:

```ts
          body: JSON.stringify({ ...body, conversationId: convId.current }),
```

to:

```ts
          // This hook is the /constellation (voice-first) client: every request is a voice
          // request. Inject here so BOTH send and confirm carry mode → spoken-register replies.
          body: JSON.stringify({ mode: "voice", ...body, conversationId: convId.current }),
```

(Placing `mode: "voice"` first lets an explicit `mode` in `body` still override it — harmless, and keeps `conversationId` last as before.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/constellation/useConstellationChat.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/constellation/useConstellationChat.ts src/components/constellation/useConstellationChat.test.ts
git commit -m "feat(constellation): client sends mode:'voice' for all requests (send + confirm)"
```

---

## Final Verification

- [ ] **Full test suite green**

Run: `npm test`
Expected: all pass, including the 3 new context tests and 2 new hook tests.

- [ ] **Type + build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Manual smoke on `/constellation`** (requires local stack: `docker compose up -d` + `npm run dev` + Ollama)

  1. Open `/constellation`, ask by voice or text: *"liệt kê các project trong DAAB"* (or any tool-backed list).
     Expected spoken reply: prose, **no** table, **no** UUIDs/dates — e.g. "Có 5 project đang hoạt động: …".
  2. Ask something that would normally draw a chart/map. Expected: no ```` ```chart ````/```` ```map ```` fenced block in the reply.
  3. Trigger a write (e.g. "tạo card…") → approve the confirm. Expected: the post-approval narration is also short spoken prose.
  4. Sanity: open `/chat`, ask the same list question. Expected: **unchanged** — table/markdown still rendered (voice mode did not leak into text chat).

- [ ] **Update CHANGELOG**

Add under `[Unreleased]` in `CHANGELOG.md` (Vietnamese, per project convention):

```
### Added
- Constellation (Jarvis) trả lời theo văn nói khi dùng giọng nói: bỏ bảng/markdown và ID dài, tóm tắt danh sách dài — qua cờ `mode: "voice"` trong `/api/chat`.
```

Then commit:

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): constellation voice spoken-mode"
```

---

## Self-Review Notes

- **Spec coverage:** Contract field (§1) → Task 2 Step 1. Prompt branch + VOICE_GUIDE + omit RENDER_GUIDE + keep tools + LANG_HINT (§2) → Task 1. `body.system` override caveat (§2) → inherent: override path never calls `buildSystemPrompt`, no code needed; covered by regression tests staying green. Client wiring at `consume` for send+confirm (§3) → Task 3 + Task 2 Step 3 (server side of confirm). Untouched list (§4) → Global Constraints + manual smoke step 4. Tests (§Testing) → Task 1 Step 1, Task 3 Step 1, Final Verification.
- **Confirm path is dual-sided:** client sends `mode` via `consume` (Task 3) AND server threads it through `handleConfirm` (Task 2 Step 3). Both are required for approval narration to be spoken-register; neither alone suffices.
- **Type consistency:** `mode?: "voice" | "text"` identical in `context.ts`, `ChatBody`, and `handleConfirm`. `buildSystemPrompt` field name `mode` matches across all call sites.
