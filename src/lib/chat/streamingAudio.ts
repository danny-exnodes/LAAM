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
