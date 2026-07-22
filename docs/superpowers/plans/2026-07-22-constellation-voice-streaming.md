# Constellation Voice Streaming (VieNeu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream Jarvis's spoken reply on `/constellation` through VieNeu `infer_stream()` so audio starts ~0.2s in, with no client-side chunking — killing the slow-first-sound, boundary word-drop, and between-chunk gaps.

**Architecture:** The VieNeu TTS service gains a `POST /tts/stream` endpoint that emits raw PCM (Int16LE, 48kHz mono) frame-by-frame from `infer_stream()`. A new Next.js route `/api/tts/stream` pipes that byte stream straight to the client. A new client module (`streamingAudio.ts`) reads the stream and plays it gaplessly via `AudioBufferSourceNode` scheduling on the shared `AudioContext`, metered by an `AnalyserNode` (replacing the per-`<audio>` `MediaElementAudioSourceNode`). Piper is dropped — VieNeu covers both vi and en.

**Tech Stack:** FastAPI + VieNeu (Python, ONNX/CPU), Next.js 16 App Router route handlers, Web Audio API, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-constellation-voice-streaming-design.md`

## Global Constraints

- **Shared audio format is a fixed constant on both ends:** PCM **Int16 little-endian, 48000 Hz, mono**. VieNeu yields float32 in [-1, 1] at 48000 Hz (verified); convert to Int16 for transport, back to Float32 for Web Audio.
- **VieNeu handles BOTH languages; Piper is removed.** `infer_stream(text, voice=…)` takes **no `lang` param** — language is inferred from the text. The request's `lang` selects only the VOICE preset (seam for a future English "Emma" voice — NOT built now; both langs use the `Thục Đoan` preset today).
- **Only `/constellation` is affected.** `/api/tts` is fetched nowhere else; `/chat` uses browser `SpeechSynthesis` (`useVoice`), not `/api/tts`. Do not touch `/chat` or `/api/chat`.
- **Keep the browser-`SpeechSynthesis` fallback** (`voice.speak`) on any stream failure, preserving the existing `fellBackRef`/`neuralSpeaking` handoff logic.
- **Animation stutter is OUT OF SCOPE** — it is CPU contention needing a separate container core-limit; streaming does not address it.
- **Do not rename** the `piper-tts` directory/container/service (becomes VieNeu-only in content; rename deferred).
- **Pre-existing uncommitted WIP note:** `piper-tts/*` and `docker-compose.yml` already carry uncommitted WIP from the user's earlier work; `git add` on them bundles that WIP into commits (user has consented to "keep as-is"). Expected — do not try to isolate it.

---

## Task 1: VieNeu-only TTS service + streaming endpoint

**Files:**
- Modify: `piper-tts/requirements.txt`
- Modify: `piper-tts/Dockerfile`
- Modify: `piper-tts/app.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST /tts/stream {text, lang}` → `application/octet-stream` of Int16LE/48k/mono PCM, streamed frame-by-frame. `POST /tts {text, lang}` → `audio/wav` (now VieNeu for both langs). `/health` → `{status, engine:"vieneu", sample_rate:48000, langs:["en","vi"]}`.

- [ ] **Step 1: Rewrite `piper-tts/requirements.txt`**

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
# VieNeu covers BOTH vi + en; Piper removed. numpy is a VieNeu dep, pinned-open here
# because app.py imports it directly for the float32->Int16 PCM conversion.
vieneu==3.2.3
numpy
```

- [ ] **Step 2: Rewrite `piper-tts/app.py`**

```python
"""VieNeu TTS HTTP service for the /constellation CONSTELLATION_TTS_URL slot.

Two endpoints, both backed by VieNeu-TTS (bilingual vi+en; infer_stream takes NO
lang param — language is inferred from the text). `lang` selects the VOICE preset
only (seam for a future per-language English voice); today all langs use one preset.

  POST /tts        {text, lang} -> audio/wav                (whole clip; fallback/debug)
  POST /tts/stream {text, lang} -> application/octet-stream  (PCM Int16LE 48kHz mono, streamed)

Piper (en) was removed: VieNeu covers English too, and streaming is VieNeu-only.
"""
import io
import wave
from typing import Iterator

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from vieneu import Vieneu

# lang -> VieNeu preset voice. Seam for a future English "Emma" voice; both default
# to the current Southern female preset for now (Emma "tạm thời chưa cần").
VOICE_BY_LANG = {"vi": "Thục Đoan", "en": "Thục Đoan"}
DEFAULT_VOICE = "Thục Đoan"
SAMPLE_RATE = 48000  # VieNeu native rate; also the shared constant the client assumes.

app = FastAPI()
_engine: Vieneu | None = None


@app.on_event("startup")
def load_engine() -> None:
    global _engine
    _engine = Vieneu()


class TtsRequest(BaseModel):
    text: str
    lang: str = "vi"


def _voice_for(lang: str):
    return _engine.get_preset_voice(VOICE_BY_LANG.get(lang, DEFAULT_VOICE))


def _to_int16_bytes(frame: np.ndarray) -> bytes:
    return (np.clip(frame, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()


@app.post("/tts")
def synthesize(req: TtsRequest) -> Response:
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="no text")
    audio = _engine.infer(req.text, voice=_voice_for(req.lang))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(_to_int16_bytes(audio))
    return Response(content=buf.getvalue(), media_type="audio/wav")


@app.post("/tts/stream")
def synthesize_stream(req: TtsRequest) -> StreamingResponse:
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="no text")
    voice = _voice_for(req.lang)

    def gen() -> Iterator[bytes]:
        for frame in _engine.infer_stream(req.text, voice=voice):
            yield _to_int16_bytes(frame)

    return StreamingResponse(gen(), media_type="application/octet-stream")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": "vieneu", "sample_rate": SAMPLE_RATE, "langs": sorted(VOICE_BY_LANG)}
```

- [ ] **Step 3: Edit `piper-tts/Dockerfile` — remove the Piper English model download**

Delete this block (the English Piper model is no longer used):

```dockerfile
# English Piper voice model, baked in so the container has no first-run
# download step.
RUN mkdir -p models \
    && curl -fsSL -o models/en_US-libritts_r-medium.onnx \
        https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx \
    && curl -fsSL -o models/en_US-libritts_r-medium.onnx.json \
        https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx.json
```

Leave the rest of the Dockerfile unchanged (it still `pip install`s requirements, copies `app.py`, and warms VieNeu via `RUN python -c "from vieneu import Vieneu; Vieneu()"`).

- [ ] **Step 4: Rebuild the image and verify both endpoints**

```bash
cd /Users/danhtrinh/Projects/Exnodes/EnnamKG/ennam.kg.workspace/other_projects/LAAM
docker compose build piper-tts
docker compose up -d piper-tts
sleep 20   # startup + VieNeu load
curl -s http://localhost:5002/health
# stream endpoint: expect a non-empty octet-stream
curl -s -N -X POST http://localhost:5002/tts/stream -H 'content-type: application/json' \
  -d '{"text":"Xin chào, đây là một câu kiểm tra luồng âm thanh.","lang":"vi"}' --output /tmp/stream.pcm
ls -l /tmp/stream.pcm   # bytes should be > 0 and a multiple of 2
# English via VieNeu still works through /tts (WAV):
curl -s -X POST http://localhost:5002/tts -H 'content-type: application/json' \
  -d '{"text":"Hello, this is an English test.","lang":"en"}' --output /tmp/en.wav && file /tmp/en.wav
```

Expected: `/health` returns `engine:"vieneu"`; `/tmp/stream.pcm` is non-empty; `/tmp/en.wav` is a RIFF WAVE file.

- [ ] **Step 5: Commit**

```bash
git add piper-tts/app.py piper-tts/Dockerfile piper-tts/requirements.txt
git commit -m "feat(tts): VieNeu-only service with streaming PCM endpoint, drop Piper"
```

---

## Task 2: `/api/tts/stream` streaming passthrough route

**Files:**
- Create: `src/app/api/tts/stream/route.ts`

**Interfaces:**
- Consumes: the service `POST /tts/stream` from Task 1, reached at `${CONSTELLATION_TTS_URL}/stream` (env var currently `http://piper-tts:5002/tts` in-network / `http://localhost:5002/tts` on host dev → `.../tts/stream`).
- Produces: `POST /api/tts/stream {text, lang}` → streams `application/octet-stream` PCM to the client, or a non-200 on failure (client falls back to browser TTS).

> **Why no unit test here:** this is pure plumbing — an auth check plus a fetch that pipes `upstream.body` through unbuffered. The existing `/api/tts` route has no unit test either. Correctness is covered by (a) the type-checker, (b) the manual curl smoke below, and (c) Task 6's client wiring exercising it end-to-end. Mocking `next-auth`'s `auth()` for one plumbing branch would be brittle and low-signal (AGENTS Rule 2).

- [ ] **Step 1: Create `src/app/api/tts/stream/route.ts`**

```ts
import { auth } from "@/auth";

// Streaming counterpart to /api/tts: pipes the VieNeu /tts/stream PCM byte stream
// (Int16LE, 48kHz mono) straight through to the /constellation client, UNBUFFERED,
// so audio starts ~0.2s in. CONSTELLATION_TTS_URL points at the WAV endpoint
// (…/tts); the streaming endpoint is that URL + "/stream".
//
// Generous timeout: it bounds the WHOLE stream, and a long reply can take ~15-20s
// to fully generate (still streaming the entire time). 60s is comfortably above any
// realistic single reply while still failing over if the upstream is truly hung.
const TTS_STREAM_TIMEOUT_MS = 60000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const base = process.env.CONSTELLATION_TTS_URL;
  if (!base) return new Response("tts not configured", { status: 501 });
  const { text, lang } = (await req.json()) as { text?: string; lang?: string };
  if (!text) return new Response("no text", { status: 400 });
  try {
    const upstream = await fetch(`${base}/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, lang: lang ?? "vi" }),
      signal: AbortSignal.timeout(TTS_STREAM_TIMEOUT_MS),
    });
    if (!upstream.ok || !upstream.body) return new Response("tts upstream error", { status: 502 });
    return new Response(upstream.body, {
      headers: { "content-type": "application/octet-stream", "cache-control": "no-store" },
    });
  } catch {
    return new Response("tts unavailable", { status: 502 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke (requires the app running via `npm run dev` + a logged-in session cookie, or test after Task 6 via the UI)**

This route requires auth, so a raw curl returns 401 without a session cookie. Defer the real check to Task 6's end-to-end UI smoke; the type-check above plus the identical-shape existing `/api/tts` route are sufficient here.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tts/stream/route.ts
git commit -m "feat(constellation): /api/tts/stream passthrough for VieNeu PCM stream"
```

---

## Task 3: PCM conversion helpers (`streamingAudio.ts`)

**Files:**
- Create: `src/lib/chat/streamingAudio.ts`
- Test: `src/lib/chat/streamingAudio.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TTS_SAMPLE_RATE = 48000`; `int16ToFloat32(bytes: Uint8Array): Float32Array`; `drainPcmChunk(leftover: Uint8Array, chunk: Uint8Array): { samples: Float32Array; leftover: Uint8Array }`. (Task 4 adds `playPcmStream` to the same file.)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/chat/streamingAudio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { int16ToFloat32, drainPcmChunk } from "./streamingAudio";

// Helper: little-endian Int16 bytes for given sample values.
function le16(...vals: number[]): Uint8Array {
  const b = new Uint8Array(vals.length * 2);
  const dv = new DataView(b.buffer);
  vals.forEach((v, i) => dv.setInt16(i * 2, v, true));
  return b;
}

describe("int16ToFloat32", () => {
  it("maps Int16 samples to Float32 in [-1,1]", () => {
    const out = int16ToFloat32(le16(0, 16384, -16384, 32767, -32768));
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(0.5, 4);
    expect(out[2]).toBeCloseTo(-0.5, 4);
    expect(out[3]).toBeCloseTo(1, 3);
    expect(out[4]).toBeCloseTo(-1, 5);
  });

  it("reads correctly from a byte view with a non-zero offset", () => {
    // simulate a subarray into a larger buffer
    const big = new Uint8Array(6);
    big.set(le16(16384), 2); // sample 0.5 at byte offset 2
    const view = big.subarray(2, 4);
    const out = int16ToFloat32(view);
    expect(out).toHaveLength(1);
    expect(out[0]).toBeCloseTo(0.5, 4);
  });
});

describe("drainPcmChunk", () => {
  it("returns whole samples and no leftover for an even-length chunk", () => {
    const { samples, leftover } = drainPcmChunk(new Uint8Array(0), le16(16384, -16384));
    expect(samples).toHaveLength(2);
    expect(leftover).toHaveLength(0);
  });

  it("carries a trailing half-sample byte and joins it with the next chunk", () => {
    const full = le16(16384, -16384); // 4 bytes = 2 samples
    const part1 = full.subarray(0, 3); // 3 bytes: 1 whole sample + 1 dangling byte
    const part2 = full.subarray(3, 4); // the missing byte

    const r1 = drainPcmChunk(new Uint8Array(0), part1);
    expect(r1.samples).toHaveLength(1);
    expect(r1.samples[0]).toBeCloseTo(0.5, 4);
    expect(r1.leftover).toHaveLength(1);

    const r2 = drainPcmChunk(r1.leftover, part2);
    expect(r2.samples).toHaveLength(1);
    expect(r2.samples[0]).toBeCloseTo(-0.5, 4);
    expect(r2.leftover).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/chat/streamingAudio.test.ts`
Expected: FAIL — module `./streamingAudio` / exports not found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/chat/streamingAudio.ts`:

```ts
// Streaming PCM playback for the /constellation voice path. The server sends raw
// PCM (Int16 little-endian, 48kHz mono); this module converts and schedules it on
// the Web Audio timeline for gapless playback, replacing the old one-WAV-per-chunk
// approach. The pure helpers here are unit-tested; playPcmStream (Task 4) needs an
// AudioContext.

export const TTS_SAMPLE_RATE = 48000;

const EMPTY = new Uint8Array(0);

/** Convert little-endian Int16 PCM bytes to Float32 samples in [-1, 1]. */
export function int16ToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

/**
 * Combine any carried-over byte with a new chunk, returning the now-complete Float32
 * samples plus a trailing half-sample byte to carry (a chunk boundary can split an
 * Int16 sample). Copies the leftover into its own array so the source chunk's buffer
 * isn't retained.
 */
export function drainPcmChunk(
  leftover: Uint8Array,
  chunk: Uint8Array,
): { samples: Float32Array; leftover: Uint8Array } {
  const combined = leftover.byteLength ? concatBytes(leftover, chunk) : chunk;
  const evenLen = combined.byteLength - (combined.byteLength % 2);
  const whole = combined.subarray(0, evenLen);
  const rest = combined.subarray(evenLen);
  return {
    samples: int16ToFloat32(whole),
    leftover: rest.byteLength ? new Uint8Array(rest) : EMPTY,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/chat/streamingAudio.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/streamingAudio.ts src/lib/chat/streamingAudio.test.ts
git commit -m "feat(constellation): PCM Int16->Float32 stream helpers"
```

---

## Task 4: `playPcmStream` — gapless Web Audio playback

**Files:**
- Modify: `src/lib/chat/streamingAudio.ts`
- Test: `src/lib/chat/streamingAudio.test.ts`

**Interfaces:**
- Consumes: `drainPcmChunk`, `TTS_SAMPLE_RATE` (Task 3).
- Produces: `PlayPcmDeps` = `{ context: AudioContext; analyser: AnalyserNode; onFirstAudio?: () => void; signal?: AbortSignal }`; `playPcmStream(body: ReadableStream<Uint8Array>, deps: PlayPcmDeps): Promise<void>` — reads the stream, schedules gapless `AudioBufferSourceNode`s through `analyser`, calls `onFirstAudio` once when the first buffer is scheduled, resolves when the last buffer ends, aborts via `signal`.

- [ ] **Step 1: Write the failing test**

First, update the two import lines at the top of `src/lib/chat/streamingAudio.test.ts` (add `vi`, and `playPcmStream`) so all imports stay at the top of the file (avoids ESLint `import/first`):

```ts
import { describe, it, expect, vi } from "vitest";
import { int16ToFloat32, drainPcmChunk, playPcmStream } from "./streamingAudio";
```

Then add this block to the same file:

```ts
// Minimal AudioContext mock recording the graph it builds.
function mockContext() {
  const created: { length: number; started: number | null }[] = [];
  const sources: { onended: (() => void) | null }[] = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    createBuffer: (_ch: number, length: number, _sr: number) => ({
      length,
      duration: length / 48000,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const s: { buffer: unknown; onended: (() => void) | null; connect: () => void; start: (t: number) => void; stop: () => void } = {
        buffer: null,
        onended: null,
        connect: vi.fn(),
        start: vi.fn((_t: number) => { created.push({ length: (s.buffer as { length: number })?.length ?? 0, started: _t }); }),
        stop: vi.fn(),
      };
      sources.push(s);
      return s;
    },
  } as unknown as AudioContext;
  return { ctx, created, sources };
}

// A ReadableStream that yields the given byte chunks.
function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  });
}

describe("playPcmStream", () => {
  it("schedules a buffer per chunk, fires onFirstAudio once, and resolves", async () => {
    vi.useFakeTimers();
    const { ctx, created, sources } = mockContext();
    const analyser = { connect: vi.fn() } as unknown as AnalyserNode;
    const onFirstAudio = vi.fn();

    // two chunks, each 2 samples (4 bytes)
    const chunk = new Uint8Array([0, 0x40, 0, 0xc0]); // 2 int16 samples
    const p = playPcmStream(streamOf([chunk, chunk]), { context: ctx, analyser, onFirstAudio });

    // let the async reader loop run
    await vi.runOnlyPendingTimersAsync();
    // fire the last source's onended so the completion promise resolves
    sources[sources.length - 1].onended?.();
    await vi.runAllTimersAsync();
    await p;

    expect(created).toHaveLength(2);          // one AudioBuffer scheduled per chunk
    expect(created[0].length).toBe(2);        // 2 samples each
    expect(onFirstAudio).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/chat/streamingAudio.test.ts`
Expected: FAIL — `playPcmStream` not exported.

- [ ] **Step 3: Implement `playPcmStream`**

Append to `src/lib/chat/streamingAudio.ts`:

```ts
export interface PlayPcmDeps {
  context: AudioContext;
  analyser: AnalyserNode; // sources connect here; caller wires analyser -> destination
  onFirstAudio?: () => void;
  signal?: AbortSignal;
}

/**
 * Read a PCM byte stream and play it gaplessly through Web Audio. Each incoming
 * chunk becomes an AudioBuffer scheduled at a running cursor (`max(currentTime,
 * nextStart)` — the max resets the cursor after any underrun so a slow network
 * causes a small gap, not overlapping playback). Resolves when the last buffer
 * ends; `signal` aborts (cancels the reader, stops scheduled nodes).
 */
export async function playPcmStream(body: ReadableStream<Uint8Array>, deps: PlayPcmDeps): Promise<void> {
  const { context, analyser, onFirstAudio, signal } = deps;
  const reader = body.getReader();
  let leftover = EMPTY;
  let nextStart = 0;
  let started = false;
  let lastEnd = context.currentTime;
  const sources: AudioBufferSourceNode[] = [];

  const stopAll = () => { for (const s of sources) { try { s.stop(); } catch { /* already stopped */ } } };
  if (signal) signal.addEventListener("abort", () => { void reader.cancel().catch(() => {}); stopAll(); }, { once: true });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || signal?.aborted) break;
      const { samples, leftover: rest } = drainPcmChunk(leftover, value);
      leftover = rest;
      if (samples.length === 0) continue;
      const buf = context.createBuffer(1, samples.length, TTS_SAMPLE_RATE);
      buf.getChannelData(0).set(samples);
      const src = context.createBufferSource();
      src.buffer = buf;
      src.connect(analyser);
      const startAt = Math.max(context.currentTime, nextStart);
      src.start(startAt);
      nextStart = startAt + buf.duration;
      lastEnd = nextStart;
      sources.push(src);
      if (!started) { started = true; onFirstAudio?.(); }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }

  if (started && !signal?.aborted && sources.length) {
    const remainingMs = Math.max(0, (lastEnd - context.currentTime) * 1000);
    await new Promise<void>((resolve) => {
      sources[sources.length - 1].onended = () => resolve();
      setTimeout(resolve, remainingMs + 250); // safety net if onended never fires
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/chat/streamingAudio.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/streamingAudio.ts src/lib/chat/streamingAudio.test.ts
git commit -m "feat(constellation): gapless Web Audio playback of PCM stream"
```

---

## Task 5: `useAudioAnalyser` — streaming TTS sink (replace `attachTts`)

**Files:**
- Modify: `src/components/constellation/useAudioAnalyser.ts`
- Test: `src/components/constellation/useAudioAnalyser.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: replaces `attachTts(el)` with `getTtsSink(): { context: AudioContext; analyser: AnalyserNode } | null` — ensures the shared `AudioContext` and a **persistent** TTS `AnalyserNode` wired `analyser → destination` (created once), returns both for `playPcmStream`. `sample()` still returns `{ mic, tts }`. `ensure`, `startMic`, `stopMic` unchanged.

- [ ] **Step 1: Rewrite the test file `src/components/constellation/useAudioAnalyser.test.ts`**

Replace the whole file (the old `attachTts` idempotency tests no longer apply):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAudioAnalyser } from "./useAudioAnalyser";

function mockAudioContext() {
  const createAnalyser = vi.fn(() => ({
    fftSize: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteTimeDomainData: vi.fn(),
  }));
  const ctx = {
    state: "running",
    resume: vi.fn(),
    close: vi.fn(),
    destination: {},
    createAnalyser,
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
  };
  return { ctx };
}

describe("useAudioAnalyser.getTtsSink", () => {
  let original: unknown;
  beforeEach(() => {
    const { ctx } = mockAudioContext();
    original = (window as unknown as { AudioContext?: unknown }).AudioContext;
    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(function AudioContextMock() {
      return ctx;
    });
  });
  afterEach(() => {
    (window as unknown as { AudioContext: unknown }).AudioContext = original;
  });

  it("returns a context and a persistent analyser, creating the analyser only once", () => {
    const { result } = renderHook(() => useAudioAnalyser());
    const a = result.current.getTtsSink();
    const b = result.current.getTtsSink();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.analyser).toBe(b!.analyser); // same analyser reused, not rebuilt per call
    const ctxInstance = (window as unknown as { AudioContext: ReturnType<typeof vi.fn> }).AudioContext.mock.results[0].value;
    expect(ctxInstance.createAnalyser).toHaveBeenCalledTimes(1);
  });

  it("wires the TTS analyser to the context destination", () => {
    const { result } = renderHook(() => useAudioAnalyser());
    const sink = result.current.getTtsSink();
    const ctxInstance = (window as unknown as { AudioContext: ReturnType<typeof vi.fn> }).AudioContext.mock.results[0].value;
    const analyser = ctxInstance.createAnalyser.mock.results[0].value;
    expect(analyser.connect).toHaveBeenCalledWith(ctxInstance.destination);
    expect(sink!.analyser).toBe(analyser);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/constellation/useAudioAnalyser.test.ts`
Expected: FAIL — `getTtsSink` not a function.

- [ ] **Step 3: Edit `src/components/constellation/useAudioAnalyser.ts`**

Remove the `ttsSource`, `ttsEl` refs and the entire `attachTts` callback. Add a `getTtsSink` callback and keep the `ttsAnalyser` ref. The full file becomes:

```ts
"use client";
import { useRef, useEffect, useCallback } from "react";

export function useAudioAnalyser() {
  const ctxRef = useRef<AudioContext | null>(null);
  const micAnalyser = useRef<AnalyserNode | null>(null);
  const ttsAnalyser = useRef<AnalyserNode | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const buf = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(512) as Uint8Array<ArrayBuffer>);
  const smooth = useRef({ mic: 0.06, tts: 0 });

  const ensure = useCallback(() => {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctxRef.current && Ctx) ctxRef.current = new Ctx();
    if (ctxRef.current?.state === "suspended") void ctxRef.current.resume();
  }, []);

  const startMic = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    ensure();
    if (!navigator.mediaDevices?.getUserMedia || !ctxRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.current = stream;
      const src = ctxRef.current.createMediaStreamSource(stream);
      const an = ctxRef.current.createAnalyser(); an.fftSize = 512;
      src.connect(an); micAnalyser.current = an;
    } catch { /* denied → no metering; caller still shows text */ }
  }, [ensure]);

  const stopMic = useCallback(() => {
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null; micAnalyser.current = null;
  }, []);

  // Persistent TTS sink for streamed playback: one AnalyserNode wired analyser ->
  // destination, created once and reused for every reply. Streamed AudioBufferSource
  // nodes connect INTO this analyser (see playPcmStream), so it meters real audio for
  // the ripples. Replaces the old per-<audio> MediaElementAudioSourceNode entirely.
  const getTtsSink = useCallback(() => {
    ensure();
    const ctx = ctxRef.current;
    if (!ctx) return null;
    if (!ttsAnalyser.current) {
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      an.connect(ctx.destination);
      ttsAnalyser.current = an;
    }
    return { context: ctx, analyser: ttsAnalyser.current };
  }, [ensure]);

  const rms = (an: AnalyserNode | null) => {
    if (!an) return 0;
    an.getByteTimeDomainData(buf.current);
    let s = 0; for (let i = 0; i < buf.current.length; i++) { const d = (buf.current[i] - 128) / 128; s += d * d; }
    return Math.min(1, Math.sqrt(s / buf.current.length) * 3.6);
  };

  const sample = useCallback(() => {
    smooth.current.mic += (rms(micAnalyser.current) - smooth.current.mic) * 0.4;
    smooth.current.tts += (rms(ttsAnalyser.current) - smooth.current.tts) * 0.45;
    return { mic: smooth.current.mic, tts: smooth.current.tts };
  }, []);

  useEffect(() => () => {
    stopMic();
    try { ttsAnalyser.current?.disconnect(); } catch {}
    void ctxRef.current?.close();
  }, [stopMic]);
  return { ensure, startMic, stopMic, getTtsSink, sample };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/constellation/useAudioAnalyser.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/constellation/useAudioAnalyser.ts src/components/constellation/useAudioAnalyser.test.ts
git commit -m "feat(constellation): streaming TTS analyser sink, drop MediaElementSource path"
```

---

## Task 6: Wire `ConstellationClient.speakReply` to the stream

**Files:**
- Modify: `src/components/constellation/ConstellationClient.tsx`

**Interfaces:**
- Consumes: `playPcmStream` (Task 4), `getTtsSink` (Task 5), `/api/tts/stream` (Task 2), `stripForSpeech` (unchanged).
- Produces: no exported change. `speakReply` streams instead of chunking; `synthChunk`, `playUrl`, `ttsElRef`, and the `chunkForSpeech`/`speakChunks` imports are removed.

> **Why no new unit test here:** `ConstellationClient.test.tsx` covers rendering/node behavior; the audio path can't run in jsdom (no real `AudioContext`/streaming fetch), matching the existing precedent where this component's audio timing is verified manually, not in jsdom. Correctness is covered by the type-checker, the existing render tests staying green, and the manual `/constellation` smoke in Final Verification.

- [ ] **Step 1: Update imports (line ~16)**

Change:
```ts
import { stripForSpeech, chunkForSpeech, speakChunks } from "@/lib/chat/voice";
```
to:
```ts
import { stripForSpeech } from "@/lib/chat/voice";
import { playPcmStream } from "@/lib/chat/streamingAudio";
```

- [ ] **Step 2: Remove `synthChunk`, `playUrl`, and `ttsElRef`**

Delete the entire `synthChunk` `useCallback` (the block commented "synthChunk: POST one chunk to /api/tts…") and the entire `playUrl` `useCallback` (the block commented "playUrl: play a synthesized wav…", including the `const ttsElRef = useRef<HTMLAudioElement | null>(null);` line just above it). They are replaced by the stream path in Step 3.

- [ ] **Step 3: Replace the `speakReply` callback**

Replace the existing `speakReply` `useCallback` (and its preceding `const fellBackRef = useRef(false);`) with:

```ts
  // speakReply: stream the whole reply through VieNeu (/api/tts/stream) and play it
  // gaplessly via Web Audio. stripForSpeech FIRST (VieNeu has no markdown awareness).
  // No client chunking — the server streams frame-by-frame, so first audio lands ~0.2s
  // in with no chunk-boundary word-drop or gaps. neuralSpeaking flips on the first real
  // audio frame (onFirstAudio). On any failure, fall back to the browser voice.
  const fellBackRef = useRef(false);
  const speakAbortRef = useRef<AbortController | null>(null);
  const speakReply = useCallback(async (text: string) => {
    if (!text) return;
    const spoken = stripForSpeech(text);
    if (!spoken) return;
    const sink = audio.getTtsSink();
    if (!sink) return;
    fellBackRef.current = false;
    speakAbortRef.current?.abort(); // cancel any in-flight playback before starting new
    const controller = new AbortController();
    speakAbortRef.current = controller;
    try {
      const res = await fetch("/api/tts/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: spoken, lang }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("tts stream failed");
      await playPcmStream(res.body, {
        context: sink.context,
        analyser: sink.analyser,
        onFirstAudio: () => setNeuralSpeaking(true),
        signal: controller.signal,
      });
    } catch {
      // Aborted (superseded by a newer reply) is not a failure — don't fall back.
      if (!controller.signal.aborted) { fellBackRef.current = true; voice.speak(spoken); }
    } finally {
      // Same handoff rule as before: on the browser-TTS fallback, keep neuralSpeaking
      // true until voice.speaking takes over (the effect above clears it), with a 4s
      // safety net; otherwise clear immediately.
      if (fellBackRef.current) setTimeout(() => setNeuralSpeaking(false), 4000);
      else setNeuralSpeaking(false);
    }
  }, [audio, lang, voice]);
```

Leave the `neuralSpeaking` state, the `useEffect` that clears it when `voice.speaking` becomes true, `getLevel`, and all call sites of `speakRef.current(...)` unchanged.

- [ ] **Step 4: Type-check + run the component's existing tests**

Run: `npx tsc --noEmit`
Expected: no errors (confirms `synthChunk`/`playUrl`/`chunkForSpeech`/`speakChunks` have no remaining references).

Run: `npx vitest run src/components/constellation/`
Expected: PASS (existing render tests unchanged; useAudioAnalyser tests from Task 5 green).

- [ ] **Step 5: Commit**

```bash
git add src/components/constellation/ConstellationClient.tsx
git commit -m "feat(constellation): stream voice replies via VieNeu instead of chunked WAVs"
```

---

## Task 7: Remove dead chunking code from `voice.ts`

**Files:**
- Modify: `src/lib/chat/voice.ts`
- Modify: `src/lib/chat/voice.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `voice.ts` keeps `speechSupport`, `langToBcp47`, `stripForSpeech` (+ its table helpers). `chunkForSpeech`, `speakChunks`, `SpeakChunksDeps`, `TTS_CHUNK_MAX_CHARS`, and the `Deferred`/`defer` helpers are removed (no remaining callers after Task 6).

- [ ] **Step 1: Delete the dead exports from `src/lib/chat/voice.ts`**

Remove, in order:
- the `TTS_CHUNK_MAX_CHARS` constant and its preceding comment block,
- the entire `chunkForSpeech` function,
- the `Deferred` interface and `defer` function,
- the `SpeakChunksDeps` interface,
- the entire `speakChunks` function.

Keep everything else (`SpeechWindowLike`, `SpeechSupport`, `speechSupport`, `langToBcp47`, `isTableRow`/`isTableSeparator`/`splitTableCells`/`tablesToProse`, `stripForSpeech`).

- [ ] **Step 2: Delete the dead tests from `src/lib/chat/voice.test.ts`**

Remove the entire `describe("voice.chunkForSpeech", …)` block and the entire `describe("voice.speakChunks", …)` block, and drop `chunkForSpeech` / `speakChunks` from the top-of-file import so only the still-exported names are imported. Keep the `speechSupport`, `langToBcp47`, and `stripForSpeech` describe blocks.

- [ ] **Step 3: Type-check + run the file's tests**

Run: `npx tsc --noEmit`
Expected: no errors (proves nothing still imports the removed symbols).

Run: `npx vitest run src/lib/chat/voice.test.ts`
Expected: PASS (remaining `speechSupport`/`langToBcp47`/`stripForSpeech` tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/chat/voice.ts src/lib/chat/voice.test.ts
git commit -m "refactor(constellation): drop now-dead chunkForSpeech/speakChunks"
```

---

## Final Verification

- [ ] **Full test suite + type check**

Run: `npx tsc --noEmit` → no errors.
Run: `npx vitest run`
Expected: all pass **except** the 4 pre-existing, unrelated `src/lib/search.test.ts` failures (a drizzle SQL-AST issue present on this branch before any of this work — confirm they are the same 4 and nothing new broke).

- [ ] **Rebuild + restart the TTS service** (already done in Task 1, re-confirm live)

```bash
docker compose up -d --build piper-tts
sleep 20 && curl -s http://localhost:5002/health   # engine:"vieneu"
```

- [ ] **Manual smoke on `/constellation`** (requires `npm run dev` + Docker stack + login)

  1. Enable voice, ask a tool-backed question that yields a multi-sentence Vietnamese reply.
     Expected: audio starts **~0.2s** after the reply text finishes (not ~2s); speech is continuous with **no** mid-reply gaps and **no** dropped/garbled words at former chunk boundaries; the core ripples still react to the voice.
  2. Ask something that yields an English reply. Expected: VieNeu speaks it (one engine); audio streams the same way.
  3. Trigger the browser-TTS fallback (e.g. stop the `piper-tts` container: `docker compose stop piper-tts`, then speak). Expected: the reply is still spoken via the browser voice; the "speaking" animation still shows. Restart: `docker compose up -d piper-tts`.
  4. Sanity: open `/chat`, use its voice. Expected: **unchanged** (browser `SpeechSynthesis`, not affected by any of this).

- [ ] **Update CHANGELOG**

Add under `[Unreleased]` in `CHANGELOG.md` (match the file's `### Đã …` Vietnamese convention):

```
### Đã thay đổi — Constellation đọc câu trả lời theo LUỒNG (VieNeu streaming), bỏ Piper
- `/constellation` nay stream cả câu trả lời qua VieNeu `infer_stream` (endpoint `/tts/stream` → PCM Int16LE 48kHz, phát bằng Web Audio `AudioBufferSourceNode`) thay vì cắt chunk ~60 ký tự rồi tải từng WAV. Kết quả: tiếng đầu ra sau ~0.2s (thay vì ~2s), hết đọc-mất-chữ ở biên chunk, hết khựng giữa các đoạn. Một engine VieNeu lo cả tiếng Việt lẫn tiếng Anh — bỏ Piper. Analyser luồng thay `MediaElementAudioSourceNode` (xoá luôn nguồn crash dựng-lại-đồ-thị-mỗi-chunk). (Animation khựng do nghẽn CPU vẫn là việc riêng, chưa xử lý ở đây.)
```

Then commit:

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): constellation VieNeu voice streaming"
```

---

## Self-Review Notes

- **Spec coverage:** Server VieNeu-only + `/tts/stream` (§C1) → Task 1. Route passthrough (§C2) → Task 2. PCM helpers + player (§C3) → Tasks 3-4. Analyser sink replacing MediaElementSource (§C4) → Task 5. ConstellationClient wiring + remove old path (§C5) → Task 6. Remove dead `chunkForSpeech`/`speakChunks`, keep `stripForSpeech` (§C6) → Task 7. Error handling / fallback (§Error Handling) → Task 6's try/catch/finally + the explicit before/after-first-audio rule (abort ≠ failure; fall back only when not aborted). Testing (§Testing) → Tasks 3-5 unit tests + Final Verification manual smoke. Drop Piper, keep `/tts` WAV, per-lang voice seam (§Goals) → Task 1.
- **Out of scope, honored:** no Emma voice (only the `VOICE_BY_LANG` seam); animation stutter untouched; `/chat` and `/api/chat` untouched; no service rename.
- **Type consistency:** `getTtsSink(): { context, analyser } | null` (Task 5) is consumed with those exact names in Task 6. `PlayPcmDeps` fields (`context`, `analyser`, `onFirstAudio`, `signal`) match between Task 4's definition and Task 6's call. `drainPcmChunk`/`int16ToFloat32`/`TTS_SAMPLE_RATE` names consistent across Tasks 3-4. `/api/tts/stream` path consistent between Task 2 (route file `src/app/api/tts/stream/route.ts`) and Task 6 (fetch URL).
- **Fallback handoff:** Task 6 preserves the `fellBackRef` + `neuralSpeaking` + 4s-safety-net logic and the existing `voice.speaking`→clear effect verbatim in behavior, so the Part D/E fixes are not regressed.
