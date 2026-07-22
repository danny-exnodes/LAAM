# Spoken-Mode Responses for Jarvis Voice (`/constellation`)

**Date:** 2026-07-22
**Status:** Design — approved for planning
**Surface:** `/constellation` (Jarvis voice assistant)

## Problem

The voice assistant ("Jarvis", branded `constellation` in code) reads its replies
aloud via TTS. But the replies are generated as **written** content — markdown
tables, bullet lists, and raw identifiers like project UUIDs. When TTS reads them,
the result is unnatural: it spells out `428a3084-43da-4edb-8656-4005a3b19825`,
enumerates table rows, and uses long written-register sentences.

Reference: ChatGPT Voice returns a different, spoken-register answer to the same
question than its text chat does — short, conversational, no IDs, no tables. We want
the same for LAAM's voice surface.

### Root cause

Voice and text **converge server-side**. Both `/chat` and `/constellation` POST to
the same `/api/chat` handler ([`src/app/api/chat/route.ts`](../../../src/app/api/chat/route.ts))
and build the same system prompt via
[`buildSystemPrompt`](../../../src/lib/agent/context.ts). The request body
(`ChatBody`, `route.ts`) carries **no** voice-vs-text indicator. All voice-specific
behavior today is **client-side, post-response**: `stripForSpeech` / `tablesToProse`
in [`src/lib/chat/voice.ts`](../../../src/lib/chat/voice.ts) strip markdown before TTS.

Stripping markdown only *reformats* written content — it cannot make the model stop
generating IDs or written-register prose in the first place. The correct lever is a
**server-side system-prompt branch** driven by a mode flag, so the model *generates*
spoken content from the start.

## Scope

**In scope:** `/constellation` only.

**Explicitly out of scope:** `/chat`'s "speak aloud" (`voiceOn`) toggle. Unlike
constellation, `/chat` shows a **visible markdown bubble**. The server emits one
response for both eye and ear; forcing spoken-mode there would strip tables/charts
from the visible transcript — a bad tradeoff. Supporting `/chat` properly would
require splitting into two outputs (one to render, one to speak), which is a separate,
more expensive change and not needed now (YAGNI).

The flag is nonetheless designed **generically** (`mode`, not a constellation-specific
name) so a future surface can opt in without a contract change.

## Design

### 1. Contract change

Add one optional field to `ChatBody` in `route.ts`:

```ts
mode?: "voice" | "text";   // default "text"
```

- Fully backward-compatible: absent → `"text"` → current behavior unchanged.
- `/constellation` always sends `mode: "voice"`.

### 2. System-prompt branch — `buildSystemPrompt`

In [`src/lib/agent/context.ts`](../../../src/lib/agent/context.ts), thread `mode`
into `buildSystemPrompt`. When `mode === "voice"`:

- **Omit `RENDER_GUIDE`** entirely (the ```` ```chart ```` / ```` ```map ```` fenced-block
  contract) — visual-only, meaningless for TTS.
- **Append a new `VOICE_GUIDE` block** with these rules:
  1. **Speak, don't write.** Short, natural, conversational sentences. No markdown —
     no tables, bullets, headings, or code fences.
  2. **Drop hard-to-say identifiers by default.** Do not read UUIDs, long hex codes,
     hashes, or file paths aloud. Mention them only if the user explicitly asks
     ("what's its id?").
  3. **Be concise; prefer a summary.** For a short list (roughly ≤ 6–8 items), read it
     naturally as prose: "gồm A, B và C". For a **long** list, say the count plus a few
     representative items, then offer to continue or narrow down — e.g. "Có 20 project
     đang hoạt động, ví dụ C4K Staging, Cảng Định An, Dasin… Bạn muốn nghe hết hay tìm
     project cụ thể?". The threshold is a soft guideline for the model to judge by
     context, **not** a hard-coded number.
  4. **Say numbers/dates like a person** would speak them, not in machine format,
     unless precision is requested.

- **Language hint (`LANG_HINT`, vi/en/zh) is unchanged.** Voice mode composes *on top
  of* the language instruction, it does not replace it.

Illustrative contrast (question: "liệt kê các project trong DAAB"):

- **text mode:** a markdown table with `#`, name, UUID, status, created-date columns.
- **voice mode:** "Có 5 project đang hoạt động: C4K Staging, Cảng Định An M&A, Cảng
  Định An v3, Dasin và Sala Food." — no UUIDs, no dates, no table.

### 3. Client wiring

In `useConstellationChat.send`
([`src/components/constellation/useConstellationChat.ts`](../../../src/components/constellation/useConstellationChat.ts)),
add `mode: "voice"` to the POST body. That is the entire client change.

- `stripForSpeech` / `chunkForSpeech` / the TTS path stay as-is. They now receive
  already-clean input, so they simply do less work — no behavior change required.

### 4. Untouched

- `/chat` text path and its `voiceOn` toggle.
- `src/lib/chat/voice.ts` (client speech shaping).
- Provider branches (Ollama / Claude / BytePlus).
- `LANG_HINT` behavior.
- The `/api/tts` proxy and `CONSTELLATION_TTS_URL` wiring.

## Testing

Unit tests for `buildSystemPrompt`:

- `mode: "voice"` → prompt **contains** `VOICE_GUIDE` markers and **omits**
  `RENDER_GUIDE`.
- `mode: "text"` and `mode` **absent** → prompt is byte-for-byte equivalent to current
  output (regression guard — proves backward compatibility).
- `mode: "voice"` still includes the correct `LANG_HINT` for vi/en/zh (voice composes
  on top of language, does not drop it).

Manual check on `/constellation`: ask "liệt kê project DAAB" and confirm the spoken
reply omits UUIDs/dates and reads as prose; ask a long-list question and confirm it
summarizes + offers to continue.

## Files touched (estimate)

| File | Change |
|---|---|
| `src/app/api/chat/route.ts` | Add `mode` to `ChatBody`; pass to `buildSystemPrompt` |
| `src/lib/agent/context.ts` | `mode` param; `VOICE_GUIDE`; omit `RENDER_GUIDE` in voice |
| `src/components/constellation/useConstellationChat.ts` | Send `mode: "voice"` |
| `src/lib/agent/context.test.ts` (or nearest) | Unit tests above |

## Risks

- **Model compliance is soft.** Prompt rules are guidance; a local model may
  occasionally still emit a UUID or a list. Acceptable for v1 — this is a quality
  improvement, not a hard guarantee. `stripForSpeech` remains the client-side backstop.
- **The long-list threshold is model-judged**, so behavior around the boundary will
  vary. Intentional — a hard number reads worse than contextual judgment.
