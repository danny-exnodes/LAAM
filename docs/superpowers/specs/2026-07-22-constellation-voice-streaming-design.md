# Constellation Voice Streaming (VieNeu) — Design

**Date:** 2026-07-22
**Status:** Approved (brainstorming) → ready for implementation plan
**Surface:** `/constellation` (Jarvis) voice command-center only. `/chat` is unaffected (it uses browser `SpeechSynthesis`, not `/api/tts`).

## Problem

On `/constellation`, a spoken reply is currently synthesized by splitting the text into ~60-char chunks (`chunkForSpeech`), POSTing each to `/api/tts`, waiting for a **complete WAV** per chunk (~2s each on CPU), and playing them back-to-back (`speakChunks` → `playUrl`, one `<audio>` element per chunk). This causes:

1. **Slow first sound** — ~2s (a whole chunk) before any audio.
2. **Words dropped/garbled at chunk boundaries** — each chunk synthesizes with no cross-chunk prosody, so a short word orphaned before a comma is mispronounced.
3. **Gaps between chunks** when synthesis can't stay ahead of playback.

VieNeu-TTS exposes `infer_stream()` — a generator that yields audio frames **as they are decoded**. Measured on the target hardware for a full reply sentence: **first audio in ~0.17–0.23s** vs ~3.5s for the whole clip via non-streaming `infer()`. Streaming the whole reply (no client chunking) directly removes all three problems above.

## Goals

- Stream the **entire** reply through VieNeu `infer_stream()`; play audio as it arrives.
- Time-to-first-audio ~0.2s (down from ~2s).
- Eliminate client-side chunking → no boundary word-drop, no between-chunk gaps.
- One engine (VieNeu) for **both** Vietnamese and English; **drop Piper**.
- Keep the browser-`SpeechSynthesis` fallback on any failure.
- Leave a cheap seam for a future per-language English voice ("Emma") without rearchitecting.

## Non-Goals (explicit)

- **The canvas animation stutter is NOT addressed here.** That is system CPU contention (both TTS engines saturate all host cores during synthesis, measured ~1230%); it needs a separate container core-limit (`--cpuset-cpus`) fix. Streaming keeps the CPU just as busy — it does not reduce total compute.
- The "Emma" English voice is **not** built now (user: "tạm thời chưa cần"). Only the per-language voice-selection seam is provided.
- No change to `/chat`, to the write-gate/confirm flow's text streaming, or to `/api/chat`.
- No rename of the `piper-tts` directory/container/service (it becomes VieNeu-only in content; renaming is optional churn, deferred).

## Architecture

```
/constellation (client)
  speakReply(fullText)
    → stripForSpeech(fullText)                     [unchanged, keeps markdown out]
    → POST /api/tts/stream {text, lang}
        → (Next.js route) proxy ReadableStream ──► piper-tts service POST /tts/stream
                                                     → VieNeu infer_stream() yields float32 frames
                                                     → encode each frame as Int16LE bytes
                                                     ← StreamingResponse (chunked, application/octet-stream)
        ◄── ReadableStream of Int16LE PCM (48kHz mono)
    → streamingAudio player:
        read stream → Int16→Float32 → AudioBuffer(s) → schedule on shared AudioContext
        AnalyserNode taps the graph → drives ripples (replaces MediaElementAudioSourceNode)
        onFirstAudio → neuralSpeaking = true
    → on stream error / no audio within timeout → fallback: useVoice.speak(text)
```

**Shared audio format constant (both ends):** PCM **Int16 little-endian, 48000 Hz, mono**. VieNeu's native output rate is 48000 (verified); frames are float32 in [-1, 1], converted to Int16 for transport. No per-frame header — the format is a documented constant on both sides.

## Components

### C1. Server — `piper-tts` service (`piper-tts/app.py`, `Dockerfile`, `requirements.txt`)

- **Remove Piper**: drop `piper-tts` dependency, the `en_US-libritts_r-medium` model download, and the `_synthesize_en` path. VieNeu handles English too (`infer_stream` is bilingual En-Vi; it takes **no `lang` param** — language is inferred from the text).
- **Voice selection seam**: the request's `lang` selects a voice preset via a small map, default both `vi` and `en` → the current `Thục Đoan` preset. (Future: `en` → an "Emma" preset. Not built now.)
- **New endpoint `POST /tts/stream`** `{text, lang}` → FastAPI `StreamingResponse`, `media_type="application/octet-stream"`. Generator: for each float32 frame from `_vi_engine.infer_stream(text, voice=<preset>)`, `yield` `np.clip(frame,-1,1)*32767 → int16 → .tobytes()`. Empty/whitespace text → 400.
- **Keep** the existing `POST /tts` (whole-WAV) endpoint — used by nothing after this change except as a manual/debug/fallback probe; low cost to retain, and avoids a flag-day.
- `/health` unchanged.

### C2. Route — `src/app/api/tts/route.ts`

- Add a streaming handler for `POST /api/tts/stream` (or a `stream` flag on the existing route — implementation choice for the plan; new path preferred for clarity).
- Keep existing `auth()` + any guards.
- Fetch the service `/tts/stream` and **return its `Response.body` (ReadableStream) directly** — no buffering. Pass through `Content-Type`. On upstream non-200 or fetch error → return a non-200 so the client falls back.

### C3. Client streaming player — `src/lib/chat/streamingAudio.ts` (new, isolated)

Pure/near-pure module, independently testable:
- **Interface:** `playPcmStream(body: ReadableStream<Uint8Array>, deps: { context: AudioContext, analyser: AnalyserNode, onFirstAudio?: () => void, signal?: AbortSignal }): Promise<void>`
- Reads the stream; maintains a **leftover-byte buffer** (a chunk may split an Int16 sample across boundaries — carry the odd trailing byte to the next read).
- Converts accumulated Int16LE → Float32 [-1,1]; creates an `AudioBuffer` (48kHz mono) per decoded batch; schedules each via an `AudioBufferSourceNode` at a running `nextStartTime` cursor (`nextStartTime = max(context.currentTime, nextStartTime)`; advance by buffer duration) for gapless playback.
- Routes source nodes → `analyser` → `context.destination`.
- Fires `onFirstAudio` when the first buffer is scheduled to start.
- Resolves when the stream ends and the last buffer has finished; rejects/So the caller can fall back on error. `signal` aborts playback (stop scheduled nodes, cancel reader).
- **Testable pure helpers** (exported): `int16ToFloat32(bytes) → Float32Array` and the leftover-byte splitter. Scheduling itself is verified manually (jsdom has no real AudioContext).

### C4. Audio analyser — `src/components/constellation/useAudioAnalyser.ts`

- Replace the `attachTts(el: HTMLAudioElement)` (MediaElementAudioSourceNode) API with a streaming-oriented one: expose the shared `AudioContext` and a persistent **TTS `AnalyserNode`** that the streaming player routes through. This **removes the per-`<audio>` MediaElementAudioSourceNode graph entirely** — eliminating the Part C crash/stutter class at its root.
- Mic path (`startMic`/`stopMic`/mic AnalyserNode) unchanged. `sample()` still returns `{ mic, tts }` from the two analysers.

### C5. ConstellationClient — `src/components/constellation/ConstellationClient.tsx`

- `speakReply(text)` becomes: `stripForSpeech` → `fetch('/api/tts/stream', …)` → `playPcmStream(res.body, { context, analyser, onFirstAudio: () => setNeuralSpeaking(true) })`; on throw/!ok → `voice.speak(text)` fallback (and clear `neuralSpeaking` per the existing Part-E/fallback-handoff logic).
- **Remove** `synthChunk`, `playUrl`, and the `chunkForSpeech`/`speakChunks` usage from this path. `neuralSpeaking` now flips on `onFirstAudio` (already the intent of the Part E fix — this makes it structural).
- Greeting, post-confirm narration, and reply-end all still route through the same `speakReply`/`speakRef` — unchanged call sites.

### C6. `src/lib/chat/voice.ts`

- `stripForSpeech` (and its table/markdown helpers) **stay** — still needed to clean text before streaming.
- `chunkForSpeech` and `speakChunks` become dead once ConstellationClient stops using them (no other callers). The plan removes them and their now-moot tests (including the Part E comma-boundary logic, which streaming supersedes).

## Error Handling

- **Upstream/service down or non-200:** route returns non-200 → client `speakReply` catches → browser-TTS fallback for the full text.
- **Stream errors mid-way, explicit rule:** if the error occurs **before any audio played**, fall back to browser TTS for the full text. If audio has **already started**, stop cleanly (do not re-speak from the beginning — re-reading a partially-spoken reply is worse than a truncated one). The player signals which case via whether `onFirstAudio` had fired.
- **No audio within a timeout** (e.g. 8s with nothing yielded): abort + fallback.
- **Empty text:** no-op (as today).

## Testing

- **Unit (Vitest):** `int16ToFloat32` round-trip and clipping; leftover-odd-byte splitter across simulated chunk boundaries; `stripForSpeech` (existing, unchanged).
- **Server:** `curl -N POST /tts/stream` returns a non-empty `application/octet-stream` byte stream; first bytes arrive quickly (manual/CI smoke).
- **Manual on `/constellation`:** first audio ~0.2s; no chunk-boundary word-drop; continuous playback; ripples still react; failure path falls back to browser voice; `/chat` unaffected.
- Web Audio scheduling is not unit-tested (jsdom lacks a real AudioContext) — the pure transforms are; the graph is verified manually, consistent with existing `useAudioAnalyser` test coverage.

## Rollout / Compatibility

- `.env` / compose `CONSTELLATION_TTS_URL` stays pointed at the same service; the client calls the new `/tts/stream` sub-path. The old `/tts` WAV endpoint remains for fallback/debug.
- Dropping Piper shrinks the image (no libritts model). English capability is preserved (VieNeu + browser-TTS fallback).
- The unrelated `supertonic-tts` audition prototype is independent of this spec and can be removed separately once the engine choice is final.

## Open Questions

None — all forks resolved during brainstorming (engine=VieNeu; both langs via VieNeu, drop Piper; per-lang voice seam, Emma deferred; playback = AudioBufferSourceNode scheduling; PCM Int16LE/48k/mono; animation out of scope).
