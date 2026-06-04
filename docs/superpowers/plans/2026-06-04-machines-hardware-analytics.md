# Machines Hardware Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a realtime CPU/GPU/VRAM/RAM "Hardware Analytics" section to the top of `/machines`, fed by a zero-dep host-native sampler reached over `host.docker.internal`.

**Architecture:** `host-agent/laam-host-metrics.mjs` (native host, zero-dep) samples `os` + `nvidia-smi` → serves `GET /metrics`. The Next route `/api/host/metrics` (auth-gated) proxies it (fail-soft 503). A client hook polls every ~2s, keeps a 60-sample rolling window, and feeds 4 gauge cards + 2 realtime area charts.

**Tech Stack:** Node `os`/`child_process`/`http` (sampler), Next 16 route handler, recharts (RadialBarChart + AreaChart), Tailwind v4, i18n vi/en/zh, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-machines-hardware-analytics-design.md`

**Ground truth (this host):** `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits` → `0, NVIDIA GeForce RTX 5070 Ti, 20, 5064, 16303, 50, 69.83` (memory in **MiB**; power may be `[N/A]`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/host-metrics.types.ts` | `HostMetrics`/`GpuMetrics` types + `parseGpuCsv`, `cpuUsagePct`, byte/format helpers |
| `host-agent/laam-host-metrics.mjs` | zero-dep sampler (os + nvidia-smi), HTTP `GET /metrics` |
| `src/app/api/host/metrics/route.ts` | auth-gated proxy → sampler, 503 fail-soft |
| `src/hooks/useHostMetrics.ts` | poll ~2s, rolling window, status |
| `src/lib/metric-colors.ts` | `METRIC_COLORS` (source of truth for recharts) |
| `src/components/machines/MetricGauge.tsx` | semicircular radial gauge |
| `src/components/machines/MetricCard.tsx` | icon + value + sub + gauge |
| `src/components/machines/MetricSparkline.tsx` | multi-series realtime area + gradient |
| `src/components/machines/HardwareAnalytics.tsx` | section: hook + 4 cards + 2 charts + states |
| `src/i18n/dictionaries/machines.ts` | vi/en/zh `machines.hw.*` |
| `src/app/machines/page.tsx` | insert `<HardwareAnalytics/>` (1 line) |
| `src/app/globals.css` | add `--metric-gpu`, `--metric-vram` to `@theme` |
| `.env.example`, `docker-compose.yml` | `HOST_METRICS_URL` (+ optional token) |

---

## Task 0: Serena boundary note + branch hygiene

- [ ] **Step 1: Write a Serena comms note to the FE session declaring file boundaries**

Create `.serena/memories/comms/active/docker-to-frontend-machines-hw.md` listing the files this feature owns (all new + the 1-line inserts to `machines/page.tsx` and `globals.css`), so the FE session avoids those. Commit only that file.

```bash
git add .serena/memories/comms/active/docker-to-frontend-machines-hw.md
git commit -m "docs(serena): declare machines Hardware Analytics file boundaries to FE"
```

---

## Task 1: Types + pure parsers (TDD)

**Files:** Create `src/lib/host-metrics.types.ts`, `src/lib/host-metrics.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/host-metrics.test.ts
import { describe, it, expect } from "vitest";
import { parseGpuCsv, cpuUsagePct, gb } from "./host-metrics.types";

describe("parseGpuCsv", () => {
  it("parses a real nvidia-smi line (MiB→bytes, power float)", () => {
    const g = parseGpuCsv("0, NVIDIA GeForce RTX 5070 Ti, 20, 5064, 16303, 50, 69.83");
    expect(g).toEqual({
      index: 0, name: "NVIDIA GeForce RTX 5070 Ti", utilPct: 20,
      memUsedBytes: 5064 * 1024 * 1024, memTotalBytes: 16303 * 1024 * 1024,
      tempC: 50, powerW: 69.83,
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
  it("is 0 when nothing changed and ~100 when fully busy", () => {
    const a = [{ idle: 100, total: 200 }];
    expect(cpuUsagePct(a, a)).toBe(0);
    const b = [{ idle: 100, total: 300 }]; // +100 idle? no: idleΔ=0,totalΔ=100 → 100% busy
    expect(cpuUsagePct(a, [{ idle: 100, total: 300 }])).toBe(100);
  });
});

describe("gb", () => {
  it("formats bytes to GB with 1 decimal", () => {
    expect(gb(5064 * 1024 * 1024)).toBe("4.9");
  });
});
```

- [ ] **Step 2: Run → fail** `npx vitest run src/lib/host-metrics.test.ts` (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/host-metrics.types.ts
export interface GpuMetrics {
  index: number; name: string; utilPct: number;
  memUsedBytes: number; memTotalBytes: number; tempC: number; powerW: number | null;
}
export interface HostMetrics {
  ts: number;
  cpu: { usagePct: number; cores: number; model: string };
  ram: { usedBytes: number; totalBytes: number };
  gpus: GpuMetrics[];
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
    index, name: p[1], utilPct,
    memUsedBytes: memUsed * MIB, memTotalBytes: memTotal * MIB,
    tempC, powerW: Number.isFinite(power) ? power : null,
  };
}

export interface CpuTimes { idle: number; total: number }
/** Average busy% across cores from two os.cpus()-derived snapshots. */
export function cpuUsagePct(prev: CpuTimes[], cur: CpuTimes[]): number {
  let idleD = 0, totalD = 0;
  for (let i = 0; i < Math.min(prev.length, cur.length); i++) {
    idleD += cur[i].idle - prev[i].idle;
    totalD += cur[i].total - prev[i].total;
  }
  if (totalD <= 0) return 0;
  return Math.round((1 - idleD / totalD) * 100);
}

export function gb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}
export function pct(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}
```

- [ ] **Step 4: Run → pass.** **Step 5: Commit** `git add src/lib/host-metrics.* && git commit -m "feat(metrics): host-metrics types + nvidia-smi/cpu parsers (TDD)"`

---

## Task 2: Host sampler (`host-agent/laam-host-metrics.mjs`)

**Files:** Create `host-agent/laam-host-metrics.mjs`

> Zero-dep. Mirrors `collector/` style. CANNOT import the TS types module; it re-implements the same parse inline (kept tiny). Verified by running on the host.

- [ ] **Step 1: Write the sampler**

```js
#!/usr/bin/env node
// LAAM host metrics sampler (zero-dep). Samples CPU (os.cpus delta), RAM (os.mem),
// and GPUs (nvidia-smi) every ~1s; serves the latest snapshot at GET /metrics.
// Run on the HOST (native), not in Docker. Reach from the app via
// host.docker.internal:PORT. Bind 0.0.0.0 so the container can reach it.
import os from "node:os";
import http from "node:http";
import { execFile } from "node:child_process";

const PORT = Number(process.env.HOST_METRICS_PORT) || 47600;
const TOKEN = process.env.HOST_METRICS_TOKEN || "";
const MIB = 1024 * 1024;

function cpuSnapshot() {
  return os.cpus().map((c) => {
    const t = c.times;
    const total = t.user + t.nice + t.sys + t.idle + t.irq;
    return { idle: t.idle, total };
  });
}
let prev = cpuSnapshot();

function gpus() {
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw",
       "--format=csv,noheader,nounits"],
      { timeout: 4000 },
      (err, stdout) => {
        if (err) return resolve([]);
        const out = [];
        for (const line of stdout.trim().split(/\r?\n/)) {
          const p = line.split(",").map((s) => s.trim());
          if (p.length < 7) continue;
          const power = parseFloat(p[6]);
          out.push({
            index: Number(p[0]), name: p[1], utilPct: Number(p[2]),
            memUsedBytes: Number(p[3]) * MIB, memTotalBytes: Number(p[4]) * MIB,
            tempC: Number(p[5]), powerW: Number.isFinite(power) ? power : null,
          });
        }
        resolve(out);
      },
    );
  });
}

let latest = null;
async function sample() {
  const cur = cpuSnapshot();
  let idleD = 0, totalD = 0;
  for (let i = 0; i < cur.length; i++) { idleD += cur[i].idle - prev[i].idle; totalD += cur[i].total - prev[i].total; }
  prev = cur;
  const usagePct = totalD > 0 ? Math.round((1 - idleD / totalD) * 100) : 0;
  latest = {
    ts: Date.now(),
    cpu: { usagePct, cores: os.cpus().length, model: os.cpus()[0]?.model?.trim() || "CPU" },
    ram: { usedBytes: os.totalmem() - os.freemem(), totalBytes: os.totalmem() },
    gpus: await gpus(),
  };
}
await sample();
setInterval(sample, 1000);

http
  .createServer((req, res) => {
    if (req.url?.split("?")[0] !== "/metrics") { res.writeHead(404).end(); return; }
    if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401).end(); return; }
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(latest));
  })
  .listen(PORT, "0.0.0.0", () => console.log(`[laam-host-metrics] :${PORT}`));
```

- [ ] **Step 2: Run on the host + verify real data**

```powershell
Start-Process -NoNewWindow node "D:\Projects\personal_projects\LAAM\host-agent\laam-host-metrics.mjs"
Start-Sleep 2
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:47600/metrics).Content
```
Expected: JSON with `cpu.usagePct` 0..100, `ram.usedBytes`/`totalBytes`, `gpus[0]` = RTX 5070 Ti with utilPct/mem/temp. If `gpus: []`, nvidia-smi isn't resolving — debug PATH.

- [ ] **Step 3: Commit** `git add host-agent/laam-host-metrics.mjs && git commit -m "feat(metrics): zero-dep host sampler (os + nvidia-smi) on :47600"`

---

## Task 3: API proxy route (`/api/host/metrics`)

**Files:** Create `src/app/api/host/metrics/route.ts`

- [ ] **Step 1: Implement** (auth-gated; fail-soft 503, OCR route pattern)

```ts
import { auth } from "@/auth";
import type { HostMetrics } from "@/lib/host-metrics.types";

const URL_ = process.env.HOST_METRICS_URL || "http://host.docker.internal:47600";
const TOKEN = process.env.HOST_METRICS_TOKEN || "";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${URL_}/metrics`, {
      signal: ctrl.signal,
      headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
      cache: "no-store",
    });
    if (!r.ok) return Response.json({ error: "host metrics unavailable" }, { status: 503 });
    const data = (await r.json()) as HostMetrics;
    return Response.json(data);
  } catch {
    return Response.json({ error: "host metrics sampler unreachable" }, { status: 503 });
  } finally {
    clearTimeout(t);
  }
}
```

- [ ] **Step 2: Verify** — `curl http://localhost:3100/api/host/metrics` unauthenticated → 401; from a logged-in browser → JSON. (Container reachability verified in Task 13.)
- [ ] **Step 3: Commit** `git add src/app/api/host/metrics/route.ts && git commit -m "feat(metrics): auth-gated /api/host/metrics proxy (fail-soft 503)"`

---

## Task 4: Polling hook (`useHostMetrics`)

**Files:** Create `src/hooks/useHostMetrics.ts`

- [ ] **Step 1: Implement**

```ts
"use client";
import { useEffect, useRef, useState } from "react";
import type { HostMetrics } from "@/lib/host-metrics.types";

const WINDOW = 60;
const INTERVAL = 2000;
export type HostStatus = "loading" | "ok" | "unavailable";

export function useHostMetrics() {
  const [current, setCurrent] = useState<HostMetrics | null>(null);
  const [history, setHistory] = useState<HostMetrics[]>([]);
  const [status, setStatus] = useState<HostStatus>("loading");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/host/metrics", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const m = (await r.json()) as HostMetrics;
        if (!alive) return;
        setCurrent(m);
        setHistory((h) => [...h, m].slice(-WINDOW));
        setStatus("ok");
      } catch {
        if (alive) setStatus((s) => (s === "ok" ? "ok" : "unavailable"));
      }
    }
    tick();
    timer.current = setInterval(tick, INTERVAL);
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, []);

  return { current, history, status };
}
```

- [ ] **Step 2: Commit** `git add src/hooks/useHostMetrics.ts && git commit -m "feat(metrics): useHostMetrics polling hook (rolling window)"`

---

## Task 5: Design tokens + color constants

**Files:** Modify `src/app/globals.css:8-10`; Create `src/lib/metric-colors.ts`

- [ ] **Step 1: Add tokens to the `@theme` block**

```css
@theme {
  --color-accent: #6d5efc;
  --metric-gpu: #22d3ee;  /* cyan-400 — graphics accent */
  --metric-vram: #38bdf8; /* sky-400 — graphics memory accent */
}
```

- [ ] **Step 2: Create the TS source of truth (recharts needs literal colors)**

```ts
// src/lib/metric-colors.ts — mirror of the --metric-* tokens in globals.css.
export const METRIC_COLORS = {
  cpu: "#6d5efc",   // accent (system)
  ram: "#8b5cf6",   // accent-vivid (system)
  gpu: "#22d3ee",   // --metric-gpu (graphics)
  vram: "#38bdf8",  // --metric-vram (graphics)
} as const;
export type MetricKey = keyof typeof METRIC_COLORS;
// Load ramp for gauges: brand normally, amber >80%, red >92%.
export function gaugeColor(base: string, valuePct: number): string {
  if (valuePct >= 92) return "#ef4444";
  if (valuePct >= 80) return "#f59e0b";
  return base;
}
```

- [ ] **Step 3: Commit** `git add src/app/globals.css src/lib/metric-colors.ts && git commit -m "feat(metrics): add --metric-gpu/--metric-vram tokens + color constants"`

---

## Task 6: MetricGauge (semicircular radial)

**Files:** Create `src/components/machines/MetricGauge.tsx`

- [ ] **Step 1: Implement** (recharts RadialBarChart, 180°→0°)

```tsx
"use client";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { gaugeColor } from "@/lib/metric-colors";

export function MetricGauge({ valuePct, color, label }: { valuePct: number; color: string; label: string }) {
  const v = Math.max(0, Math.min(100, valuePct));
  const fill = gaugeColor(color, v);
  return (
    <div style={{ width: "100%", height: 96 }} aria-label={`${label} ${v}%`}>
      <ResponsiveContainer>
        <RadialBarChart
          innerRadius="78%" outerRadius="100%" startAngle={180} endAngle={0}
          data={[{ v }]} barSize={10}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "rgba(120,120,135,0.18)" }} dataKey="v" cornerRadius={6}
            fill={fill} angleAxisId={0} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Commit** `git add src/components/machines/MetricGauge.tsx && git commit -m "feat(metrics): MetricGauge semicircular radial"`

---

## Task 7: MetricCard

**Files:** Create `src/components/machines/MetricCard.tsx`

- [ ] **Step 1: Implement** (card idiom + left-accent + gauge; value overlaps gauge center)

```tsx
"use client";
import type { ReactNode } from "react";
import { MetricGauge } from "./MetricGauge";

export function MetricCard({
  label, color, valuePct, primary, sub, icon,
}: { label: string; color: string; valuePct: number; primary: string; sub: string; icon: ReactNode }) {
  return (
    <div
      style={{ borderTopColor: color }}
      className="rounded-xl border border-t-2 border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
        <span style={{ color }}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="relative mt-2">
        <MetricGauge valuePct={valuePct} color={color} label={label} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-2xl font-bold text-neutral-800 dark:text-neutral-100">{primary}</span>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{sub}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit** `git add src/components/machines/MetricCard.tsx && git commit -m "feat(metrics): MetricCard (gauge + value + sub)"`

---

## Task 8: MetricSparkline (multi-series realtime area)

**Files:** Create `src/components/machines/MetricSparkline.tsx`

- [ ] **Step 1: Implement** (AreaChart + per-series linearGradient; follows TokensByDay)

```tsx
"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { useChartTheme } from "@/hooks/useChartTheme";

export interface Series { key: string; name: string; color: string }
export function MetricSparkline({
  data, series, title,
}: { data: Record<string, number | string>[]; series: Series[]; title: string }) {
  const theme = useChartTheme();
  return (
    <div className="chart-card">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{title}</h3>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="t" tick={false} axisLine={false} />
            <YAxis domain={[0, 100]} width={32} tick={{ fontSize: 11, fill: theme.axis }} />
            <Tooltip contentStyle={theme.tooltip} formatter={(v) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color}
                fill={`url(#grad-${s.key})`} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit** `git add src/components/machines/MetricSparkline.tsx && git commit -m "feat(metrics): MetricSparkline multi-series realtime area"`

---

## Task 9: i18n dictionary

**Files:** Create `src/i18n/dictionaries/machines.ts`

- [ ] **Step 1: Implement** (flat `machines.hw.*` keys, vi/en/zh)

```ts
import type { Dict } from "../types";
export const machinesDict: Dict = {
  "machines.hw.title": { vi: "Phân tích phần cứng máy chủ", en: "Server hardware analytics", zh: "服务器硬件分析" },
  "machines.hw.cpu": { vi: "CPU", en: "CPU", zh: "处理器" },
  "machines.hw.gpu": { vi: "GPU", en: "GPU", zh: "显卡" },
  "machines.hw.vram": { vi: "VRAM", en: "VRAM", zh: "显存" },
  "machines.hw.ram": { vi: "RAM", en: "RAM", zh: "内存" },
  "machines.hw.cores": { vi: "{n} nhân", en: "{n} cores", zh: "{n} 核" },
  "machines.hw.utilization": { vi: "Mức sử dụng theo thời gian", en: "Utilization over time", zh: "使用率随时间变化" },
  "machines.hw.memory": { vi: "Bộ nhớ theo thời gian", en: "Memory over time", zh: "内存随时间变化" },
  "machines.hw.unavailable": { vi: "Không lấy được số liệu phần cứng (sampler chưa chạy).", en: "Hardware metrics unavailable (sampler not running).", zh: "无法获取硬件指标（采样器未运行）。" },
  "machines.hw.noGpu": { vi: "Không phát hiện GPU", en: "No GPU detected", zh: "未检测到 GPU" },
  "machines.hw.loading": { vi: "Đang lấy số liệu…", en: "Loading metrics…", zh: "正在加载指标…" },
};
```

- [ ] **Step 2: Commit** `git add src/i18n/dictionaries/machines.ts && git commit -m "feat(i18n): machines.hw.* strings (vi/en/zh)"`

---

## Task 10: HardwareAnalytics section

**Files:** Create `src/components/machines/HardwareAnalytics.tsx`

- [ ] **Step 1: Implement** (hook + states + 4 cards + 2 charts; uses lucide `Cpu`, `Microchip`, `MemoryStick`, `HardDrive`)

```tsx
"use client";
import { Cpu, Microchip, MemoryStick, HardDrive } from "lucide-react";
import { useHostMetrics } from "@/hooks/useHostMetrics";
import { useT } from "@/i18n/provider";
import { machinesDict } from "@/i18n/dictionaries/machines";
import { METRIC_COLORS } from "@/lib/metric-colors";
import { gb, pct } from "@/lib/host-metrics.types";
import { MetricCard } from "./MetricCard";
import { MetricSparkline } from "./MetricSparkline";

export function HardwareAnalytics() {
  const t = useT(machinesDict);
  const { current, history, status } = useHostMetrics();

  if (status === "unavailable") {
    return <div className="chart-card mb-4 text-sm text-neutral-500 dark:text-neutral-400">{t("machines.hw.unavailable")}</div>;
  }
  if (!current) {
    return <div className="chart-card mb-4 text-sm text-neutral-400">{t("machines.hw.loading")}</div>;
  }

  const g = current.gpus[0];
  const ramPct = pct(current.ram.usedBytes, current.ram.totalBytes);
  const vramPct = g ? pct(g.memUsedBytes, g.memTotalBytes) : 0;

  const trend = history.map((m) => {
    const gg = m.gpus[0];
    return {
      t: m.ts, cpu: m.cpu.usagePct, gpu: gg?.utilPct ?? 0,
      ram: pct(m.ram.usedBytes, m.ram.totalBytes),
      vram: gg ? pct(gg.memUsedBytes, gg.memTotalBytes) : 0,
    };
  });

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {t("machines.hw.title")}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("machines.hw.cpu")} color={METRIC_COLORS.cpu} valuePct={current.cpu.usagePct}
          primary={`${current.cpu.usagePct}%`} sub={t("machines.hw.cores", { n: current.cpu.cores })} icon={<Cpu size={16} />} />
        <MetricCard label={t("machines.hw.gpu")} color={METRIC_COLORS.gpu} valuePct={g?.utilPct ?? 0}
          primary={g ? `${g.utilPct}%` : "—"} sub={g ? `${g.tempC}°C` : t("machines.hw.noGpu")} icon={<Microchip size={16} />} />
        <MetricCard label={t("machines.hw.vram")} color={METRIC_COLORS.vram} valuePct={vramPct}
          primary={g ? `${gb(g.memUsedBytes)}/${gb(g.memTotalBytes)} GB` : "—"} sub={g ? `${vramPct}%` : t("machines.hw.noGpu")} icon={<HardDrive size={16} />} />
        <MetricCard label={t("machines.hw.ram")} color={METRIC_COLORS.ram} valuePct={ramPct}
          primary={`${gb(current.ram.usedBytes)}/${gb(current.ram.totalBytes)} GB`} sub={`${ramPct}%`} icon={<MemoryStick size={16} />} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <MetricSparkline title={t("machines.hw.utilization")} data={trend}
          series={[{ key: "gpu", name: t("machines.hw.gpu"), color: METRIC_COLORS.gpu }, { key: "cpu", name: t("machines.hw.cpu"), color: METRIC_COLORS.cpu }]} />
        <MetricSparkline title={t("machines.hw.memory")} data={trend}
          series={[{ key: "vram", name: t("machines.hw.vram"), color: METRIC_COLORS.vram }, { key: "ram", name: t("machines.hw.ram"), color: METRIC_COLORS.ram }]} />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit** `git add src/components/machines/HardwareAnalytics.tsx && git commit -m "feat(metrics): HardwareAnalytics section (4 cards + 2 trends)"`

---

## Task 11: Wire into the machines page

**Files:** Modify `src/app/machines/page.tsx` (insert before `<MachinesManager>`), add import.

- [ ] **Step 1: Add import + element**

Import: `import { HardwareAnalytics } from "@/components/machines/HardwareAnalytics";`
Insert between `<PageHeader .../>` and `<MachinesManager .../>` (after line 45):
```tsx
        <HardwareAnalytics />
```

- [ ] **Step 2: Commit** `git add src/app/machines/page.tsx && git commit -m "feat(machines): mount HardwareAnalytics atop the page"`

---

## Task 12: Env wiring

**Files:** Modify `.env.example`, `docker-compose.yml` (app.environment)

- [ ] **Step 1: `.env.example`** — append:
```
# --- Host hardware metrics sampler (host-agent/laam-host-metrics.mjs) ---
# Dev app (host) reaches it on localhost; the Docker app via host.docker.internal.
HOST_METRICS_URL=http://127.0.0.1:47600
# Optional shared secret (set the same on the sampler via HOST_METRICS_TOKEN):
# HOST_METRICS_TOKEN=
```

- [ ] **Step 2: `docker-compose.yml`** — add under `app.environment:`:
```yaml
      HOST_METRICS_URL: http://host.docker.internal:47600
```

- [ ] **Step 3: Commit** `git add .env.example docker-compose.yml && git commit -m "feat(metrics): HOST_METRICS_URL env (dev localhost / prod host-gateway)"`

---

## Task 13: Verify + rebuild production

- [ ] **Step 1: Unit tests + build**
```powershell
npx vitest run src/lib/host-metrics.test.ts
npm run build   # next build must compile all new components
```
Expected: tests pass; build "Compiled successfully" with `/api/host/metrics` in the route list.

- [ ] **Step 2: Sampler live data on host** (Task 2 Step 2 already proves it; ensure it's running).

- [ ] **Step 3: Rebuild + redeploy container, verify reachability host.docker.internal**
```bash
git -C "D:/Projects/personal_projects/LAAM-docker" merge --ff-only main
docker build -t laam-app:latest "D:/Projects/personal_projects/LAAM-docker"
docker compose up -d app
# container can reach the host sampler:
docker exec laam-v2-app node -e "fetch('http://host.docker.internal:47600/metrics').then(r=>r.json()).then(j=>console.log('gpu0:', j.gpus[0]?.name, j.cpu.usagePct+'%')).catch(e=>console.log('FAIL',e.message))"
```
Expected: prints RTX 5070 Ti + CPU% → proves the container path works.

- [ ] **Step 4: Visual** — load `/machines` (dev :3100 or container :3900) logged-in; confirm 4 gauge cards animate (~2s) + 2 trend charts, light+dark, down to 440px. Capture a screenshot for the report.

- [ ] **Step 5: Serena checkpoint + decision; resolve the comms note.**

---

## Self-review — spec coverage

- Sampler/types/route/hook/cards/charts/tokens/i18n/page/env → Tasks 1–12. Verify+container+visual → Task 13. ✓
- 4 cards (CPU/GPU/VRAM/RAM), 2 trend charts, 2 new tokens, fail-soft 503, host.docker.internal, ephemeral rolling window, vi/en/zh → all covered. ✓
- Gauge load ramp (80/92) → `gaugeColor` (Task 5). ✓ Multi-GPU/history/alerts → out of scope (noted). ✓
