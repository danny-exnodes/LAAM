// Streaming PCM playback for the /constellation voice path. The server sends raw
// PCM (Int16 little-endian, 48kHz mono); this module converts and schedules it on
// the Web Audio timeline for gapless playback, replacing the old one-WAV-per-chunk
// approach. The pure helpers here are unit-tested; playPcmStream (Task 4) needs an
// AudioContext.

export const TTS_SAMPLE_RATE = 48000;

// How much audio to accumulate before starting playback. VieNeu-CPU delivers its first
// chunks SLOWER than real time (measured: ~0.32s of audio per ~0.40s wall early on, only
// catching up later), so scheduling each chunk the moment it arrives makes the playback
// cursor fall behind immediately — every later chunk then starts after a gap. Simulated
// against real measured chunk timings for one 17s segment: prebuffer 0s → 11 underruns
// (1.89s of gaps, heard as crackling/stutter); 2s → 2; 3s → ZERO. Costs ~2.6s before the
// first sound on the FIRST segment only — later segments are prefetched during playback,
// so their data is already buffered and this threshold is met instantly.
export const TTS_PREBUFFER_SECONDS = 3;

// Small headroom so the very first buffer isn't scheduled at a timestamp the audio thread
// has already passed (which clips the start of the reply).
const START_LEAD_SECONDS = 0.05;

// Stop draining the stream once this much audio is already scheduled ahead of the play
// head. This is a MAIN-THREAD fix, not an audio one: a prefetched segment is usually
// fully buffered by the time we read it, so `reader.read()` resolves as a microtask —
// and microtasks run to completion without ever yielding to rendering. An unpaced loop
// therefore builds the whole segment (dozens of AudioBuffers) inside ONE task and froze
// the page for 1-2s at each segment transition. Waiting on a timer instead yields a real
// macrotask so the browser can paint, and the resulting backpressure also lets the
// server pause generating. 6s keeps playback far enough ahead to stay gapless.
const SCHEDULE_AHEAD_SECONDS = 6;
const DRAIN_PAUSE_MS = 120;

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

/** Shared scheduling position threaded across sequential playPcmStream calls (segments)
 * so segment 2 picks up exactly where segment 1 left off. Omit for a standalone call. */
export interface PlaybackCursor {
  value: number;
}

export interface PlayPcmDeps {
  context: AudioContext;
  analyser: AnalyserNode; // sources connect here; caller wires analyser -> destination
  onFirstAudio?: () => void;
  signal?: AbortSignal;
  cursor?: PlaybackCursor;
  /** Seconds of audio to buffer before playback starts. Defaults to TTS_PREBUFFER_SECONDS. */
  prebufferSeconds?: number;
  /** Stop draining once this much audio is scheduled ahead. Defaults to SCHEDULE_AHEAD_SECONDS. */
  scheduleAheadSeconds?: number;
}

/**
 * Read a PCM byte stream and play it gaplessly through Web Audio. Buffers
 * `prebufferSeconds` of audio BEFORE starting (see TTS_PREBUFFER_SECONDS — without this
 * the cursor falls behind a slower-than-real-time producer and every chunk lands after a
 * gap, heard as crackling), then schedules each chunk at a running cursor
 * (`max(currentTime, cursor.value)` — the max resets the cursor after any underrun so a
 * stall causes a gap, not overlapping playback). A stream shorter than the prebuffer
 * plays as soon as it ends. Resolves when the last buffer ends; `signal` aborts (cancels
 * the reader, stops scheduled nodes). Pass the same `cursor` object across sequential
 * calls to chain segments back-to-back with no gap.
 */
export async function playPcmStream(body: ReadableStream<Uint8Array>, deps: PlayPcmDeps): Promise<void> {
  const { context, analyser, onFirstAudio, signal } = deps;
  const cursor = deps.cursor ?? { value: 0 };
  const prebufferSeconds = deps.prebufferSeconds ?? TTS_PREBUFFER_SECONDS;
  const scheduleAheadSeconds = deps.scheduleAheadSeconds ?? SCHEDULE_AHEAD_SECONDS;
  const reader = body.getReader();
  let leftover: Uint8Array = EMPTY;
  let started = false;
  let lastEnd = context.currentTime;
  const sources: AudioBufferSourceNode[] = [];
  // Samples held back until the prebuffer threshold is met.
  let pending: Float32Array[] = [];
  let pendingSeconds = 0;

  const stopAll = () => { for (const s of sources) { try { s.stop(); } catch { /* already stopped */ } } };
  if (signal) signal.addEventListener("abort", () => { void reader.cancel().catch(() => {}); stopAll(); }, { once: true });

  const schedule = (samples: Float32Array) => {
    const buf = context.createBuffer(1, samples.length, TTS_SAMPLE_RATE);
    buf.getChannelData(0).set(samples);
    const src = context.createBufferSource();
    src.buffer = buf;
    src.connect(analyser);
    const startAt = Math.max(context.currentTime, cursor.value);
    src.start(startAt);
    cursor.value = startAt + buf.duration;
    lastEnd = cursor.value;
    sources.push(src);
  };

  // Release everything held back and mark playback started. Nudges the cursor a hair into
  // the future first so the opening buffer isn't scheduled in the audio thread's past.
  const startPlayback = () => {
    started = true;
    cursor.value = Math.max(cursor.value, context.currentTime + START_LEAD_SECONDS);
    for (const s of pending) schedule(s);
    pending = [];
    pendingSeconds = 0;
    onFirstAudio?.();
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || signal?.aborted) break;
      const { samples, leftover: rest } = drainPcmChunk(leftover, value);
      leftover = rest;
      if (samples.length === 0) continue;
      if (started) {
        schedule(samples);
        // Yield the main thread while we're comfortably ahead (see SCHEDULE_AHEAD_SECONDS).
        while (!signal?.aborted && cursor.value - context.currentTime > scheduleAheadSeconds) {
          await new Promise((r) => setTimeout(r, DRAIN_PAUSE_MS));
        }
        continue;
      }
      pending.push(samples);
      pendingSeconds += samples.length / TTS_SAMPLE_RATE;
      if (pendingSeconds >= prebufferSeconds) startPlayback();
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }

  // Stream ended before the prebuffer filled (a short segment) — play what we have.
  if (!started && pending.length && !signal?.aborted) startPlayback();

  if (started && !signal?.aborted && sources.length) {
    const remainingMs = Math.max(0, (lastEnd - context.currentTime) * 1000);
    await new Promise<void>((resolve) => {
      sources[sources.length - 1].onended = () => resolve();
      setTimeout(resolve, remainingMs + 250); // safety net if onended never fires
    });
  }
}
