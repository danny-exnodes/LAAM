import { describe, it, expect, vi } from "vitest";
import { int16ToFloat32, drainPcmChunk, playPcmStream } from "./streamingAudio";

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

  // INTENT: segmented replies (see voice.splitForSpeech) call playPcmStream once per
  // segment. Without a shared cursor, each call's local scheduling position resets to
  // 0, so segment 2 would either overlap segment 1 (both starting near t=0) or need the
  // caller to somehow know when segment 1 ends. A shared cursor object threaded across
  // calls lets segment 2 pick up exactly where segment 1 left off — no gap, no overlap.
  it("chains scheduling across sequential calls via a shared cursor (no gap between segments)", async () => {
    vi.useFakeTimers();
    const { ctx, created, sources } = mockContext();
    const analyser = { connect: vi.fn() } as unknown as AnalyserNode;
    const cursor = { value: 0 };
    const chunk = new Uint8Array([0, 0x40, 0, 0xc0]); // 2 int16 samples

    const p1 = playPcmStream(streamOf([chunk]), { context: ctx, analyser, cursor });
    await vi.runOnlyPendingTimersAsync();
    sources[sources.length - 1].onended?.();
    await vi.runAllTimersAsync();
    await p1;

    const firstSegmentEnd = cursor.value;
    expect(firstSegmentEnd).toBeGreaterThan(0);

    const p2 = playPcmStream(streamOf([chunk]), { context: ctx, analyser, cursor });
    await vi.runOnlyPendingTimersAsync();
    sources[sources.length - 1].onended?.();
    await vi.runAllTimersAsync();
    await p2;

    // Second segment's first buffer starts exactly where the first segment ended.
    expect(created[1].started).toBeCloseTo(firstSegmentEnd, 6);
    vi.useRealTimers();
  });

  it("without a cursor, starts fresh from context.currentTime plus a small scheduling lead", async () => {
    vi.useFakeTimers();
    const { ctx, created, sources } = mockContext();
    const analyser = { connect: vi.fn() } as unknown as AnalyserNode;
    const chunk = new Uint8Array([0, 0x40, 0, 0xc0]);

    const p = playPcmStream(streamOf([chunk]), { context: ctx, analyser });
    await vi.runOnlyPendingTimersAsync();
    sources[sources.length - 1].onended?.();
    await vi.runAllTimersAsync();
    await p;

    // ctx.currentTime is 0 in the mock; the opening buffer is nudged just into the future
    // so it isn't scheduled at a timestamp the audio thread has already passed.
    expect(created[0].started).toBeGreaterThan(0);
    expect(created[0].started).toBeLessThan(0.2);
    vi.useRealTimers();
  });

  // INTENT: VieNeu-CPU delivers its first chunks slower than real time, so scheduling each
  // chunk on arrival makes the cursor fall behind and every later chunk lands after a gap —
  // heard as crackling. Nothing may be scheduled until prebufferSeconds of audio is held.
  it("holds playback until prebufferSeconds of audio is buffered, then releases it all", async () => {
    vi.useFakeTimers();
    const { ctx, created, sources } = mockContext();
    const analyser = { connect: vi.fn() } as unknown as AnalyserNode;
    const onFirstAudio = vi.fn();

    // 4 chunks x 24000 samples = 0.5s each at 48kHz; prebuffer 1s → release on the 2nd.
    const chunkSamples = 24000;
    const chunk = new Uint8Array(chunkSamples * 2);
    const p = playPcmStream(streamOf([chunk, chunk, chunk, chunk]), {
      context: ctx, analyser, onFirstAudio, prebufferSeconds: 1,
    });
    await vi.runOnlyPendingTimersAsync();
    sources[sources.length - 1].onended?.();
    await vi.runAllTimersAsync();
    await p;

    // All four chunks are eventually scheduled — buffering delays audio, never drops it.
    expect(created).toHaveLength(4);
    expect(created.every((c) => c.length === chunkSamples)).toBe(true);
    expect(onFirstAudio).toHaveBeenCalledTimes(1);
    // Back-to-back with no gaps: each buffer starts exactly where the previous ended.
    for (let i = 1; i < created.length; i++) {
      expect(created[i].started).toBeCloseTo(created[i - 1].started! + chunkSamples / 48000, 6);
    }
    vi.useRealTimers();
  });

  // INTENT: a prefetched segment is usually already fully buffered, so reader.read()
  // resolves as a microtask — and microtasks never yield to rendering. Draining without
  // pacing therefore builds the whole segment's AudioBuffers inside ONE task and froze the
  // page for 1-2s at each segment transition. Scheduling must stop once far enough ahead.
  it("stops draining once scheduleAheadSeconds is buffered, then resumes as playback advances", async () => {
    vi.useFakeTimers();
    const { ctx, created, sources } = mockContext();
    const clock = ctx as unknown as { currentTime: number };
    const analyser = { connect: vi.fn() } as unknown as AnalyserNode;

    // 20 chunks x 0.5s = 10s of audio, all available immediately (the prefetched case).
    const chunkSamples = 24000;
    const chunks = Array.from({ length: 20 }, () => new Uint8Array(chunkSamples * 2));
    let finished = false;
    const done = playPcmStream(streamOf(chunks), {
      context: ctx, analyser, prebufferSeconds: 1, scheduleAheadSeconds: 2,
    }).then(() => { finished = true; });

    await vi.advanceTimersByTimeAsync(500);
    // Only what fits in the lead is scheduled — NOT all 20 chunks in one burst.
    const scheduledWhileHeld = created.length;
    expect(scheduledWhileHeld).toBeGreaterThan(0);
    expect(scheduledWhileHeld).toBeLessThan(chunks.length);

    // Advance the play head like real playback: the lead shrinks, draining resumes, and
    // every chunk eventually lands — pacing delays audio, it never drops it. (The reader
    // only reaches end-of-stream once playback has caught up, which is the backpressure
    // working as intended, so the clock has to keep moving for the call to complete.)
    for (let i = 0; i < 200 && !finished; i++) {
      clock.currentTime += 0.5;
      await vi.advanceTimersByTimeAsync(200);
      sources[sources.length - 1]?.onended?.();
    }
    await done;

    expect(created.length).toBeGreaterThan(scheduledWhileHeld);
    expect(created).toHaveLength(chunks.length);
    vi.useRealTimers();
  });

  it("plays a stream shorter than the prebuffer as soon as it ends (no indefinite hold)", async () => {
    vi.useFakeTimers();
    const { ctx, created, sources } = mockContext();
    const analyser = { connect: vi.fn() } as unknown as AnalyserNode;
    const onFirstAudio = vi.fn();

    const chunk = new Uint8Array([0, 0x40, 0, 0xc0]); // 2 samples, far below any prebuffer
    const p = playPcmStream(streamOf([chunk]), {
      context: ctx, analyser, onFirstAudio, prebufferSeconds: 10,
    });
    await vi.runOnlyPendingTimersAsync();
    sources[sources.length - 1]?.onended?.();
    await vi.runAllTimersAsync();
    await p;

    expect(created).toHaveLength(1);
    expect(onFirstAudio).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
