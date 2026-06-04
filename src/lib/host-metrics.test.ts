import { describe, it, expect } from "vitest";
import { parseGpuCsv, cpuUsagePct, gb, pct } from "./host-metrics.types";

describe("parseGpuCsv", () => {
  it("parses a real nvidia-smi line (MiB→bytes, power float)", () => {
    const g = parseGpuCsv("0, NVIDIA GeForce RTX 5070 Ti, 20, 5064, 16303, 50, 69.83");
    expect(g).toEqual({
      index: 0,
      name: "NVIDIA GeForce RTX 5070 Ti",
      utilPct: 20,
      memUsedBytes: 5064 * 1024 * 1024,
      memTotalBytes: 16303 * 1024 * 1024,
      tempC: 50,
      powerW: 69.83,
    });
  });
  it("returns null powerW when nvidia-smi reports [N/A]", () => {
    expect(parseGpuCsv("0, X, 10, 1, 2, 40, [N/A]")?.powerW).toBeNull();
  });
  it("returns null for a malformed line", () => {
    expect(parseGpuCsv("garbage")).toBeNull();
  });
});

describe("cpuUsagePct", () => {
  it("is 0 when nothing changed", () => {
    const a = [{ idle: 100, total: 200 }];
    expect(cpuUsagePct(a, a)).toBe(0);
  });
  it("is 100 when all the delta is non-idle", () => {
    const a = [{ idle: 100, total: 200 }];
    const b = [{ idle: 100, total: 300 }]; // idleΔ=0, totalΔ=100 → fully busy
    expect(cpuUsagePct(a, b)).toBe(100);
  });
  it("averages across cores", () => {
    const prev = [{ idle: 0, total: 0 }, { idle: 0, total: 0 }];
    const cur = [{ idle: 50, total: 100 }, { idle: 0, total: 100 }]; // 50% + 100% → 75%
    expect(cpuUsagePct(prev, cur)).toBe(75);
  });
});

describe("gb / pct", () => {
  it("formats bytes to GB with 1 decimal", () => {
    expect(gb(5064 * 1024 * 1024)).toBe("4.9");
  });
  it("computes integer percent, guarding divide-by-zero", () => {
    expect(pct(5064, 16303)).toBe(31);
    expect(pct(1, 0)).toBe(0);
  });
});
