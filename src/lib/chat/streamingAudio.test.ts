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
