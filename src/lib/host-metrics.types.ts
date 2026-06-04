// Host hardware metrics — shared types + pure parsers/formatters.
// Sampled by host-agent/laam-host-metrics.mjs (which re-implements the parse
// inline because it is zero-dep JS), surfaced via /api/host/metrics.

export interface GpuMetrics {
  index: number;
  name: string;
  utilPct: number; // 0..100
  memUsedBytes: number;
  memTotalBytes: number;
  tempC: number;
  powerW: number | null; // null when nvidia-smi reports [N/A]
}

export interface HostMetrics {
  ts: number; // epoch ms (sampler clock)
  cpu: { usagePct: number; cores: number; model: string };
  ram: { usedBytes: number; totalBytes: number };
  gpus: GpuMetrics[]; // [] when no NVIDIA GPU / nvidia-smi unavailable
}

const MIB = 1024 * 1024;

/** Parse one `nvidia-smi --format=csv,noheader,nounits` line. Returns null if malformed. */
export function parseGpuCsv(line: string): GpuMetrics | null {
  const p = line.split(",").map((s) => s.trim());
  if (p.length < 7) return null;
  const index = Number(p[0]);
  const utilPct = Number(p[2]);
  const memUsed = Number(p[3]);
  const memTotal = Number(p[4]);
  const tempC = Number(p[5]);
  if (![index, utilPct, memUsed, memTotal, tempC].every(Number.isFinite)) return null;
  const power = parseFloat(p[6]);
  return {
    index,
    name: p[1],
    utilPct,
    memUsedBytes: memUsed * MIB,
    memTotalBytes: memTotal * MIB,
    tempC,
    powerW: Number.isFinite(power) ? power : null,
  };
}

export interface CpuTimes {
  idle: number;
  total: number;
}

/** Busy% from two os.cpus()-derived snapshots (idle/total deltas summed over cores). */
export function cpuUsagePct(prev: CpuTimes[], cur: CpuTimes[]): number {
  let idleD = 0;
  let totalD = 0;
  for (let i = 0; i < Math.min(prev.length, cur.length); i++) {
    idleD += cur[i].idle - prev[i].idle;
    totalD += cur[i].total - prev[i].total;
  }
  if (totalD <= 0) return 0;
  return Math.round((1 - idleD / totalD) * 100);
}

/** Bytes → GB string with 1 decimal. */
export function gb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

/** Integer percent, guarding divide-by-zero. */
export function pct(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}
