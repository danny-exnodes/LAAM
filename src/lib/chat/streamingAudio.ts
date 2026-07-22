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
  let leftover: Uint8Array = EMPTY;
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
