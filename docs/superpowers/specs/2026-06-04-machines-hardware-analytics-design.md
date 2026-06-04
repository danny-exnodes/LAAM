# Spec: Machines page — Hardware Analytics (CPU/GPU/VRAM/RAM realtime)

- **Date**: 2026-06-04
- **Author**: Claude (tech-lead / infra session)
- **Status**: Awaiting user review
- **Feature**: Add a "Hardware Analytics" section to the top of `/machines` showing realtime
  CPU / GPU / VRAM / RAM metrics of the **host server** as metric cards (semicircular gauges)
  plus realtime trend charts. Visual north star: the two reference images the user provided
  (dark, modern, semicircular gauges + realtime area charts, purple→blue palette).

## Approved decisions (user)

1. **Source**: host-only (the machine running LAAM — RTX 5070 Ti + Ollama). No multi-machine.
2. **Realtime**: ephemeral — client polls every ~2s, keeps an in-memory rolling window. **No DB,
   no history persistence.**
3. **Deliverable**: this session writes spec + plan **and implements** (backend data + frontend
   cards), coordinating file boundaries with the parallel FE session.
4. **Cards**: CPU · GPU · **VRAM (separate)** · RAM (4 cards).

## Key architectural constraint (drives the design)

The production app runs **inside Docker**; the **GPU + `nvidia-smi` live on the host** (we
deliberately did not pass the GPU into the container). So an in-process read from the Next
server in the container cannot see the host GPU, and sees only a container-scoped view of
CPU/RAM. Therefore host metrics come from a **small host-native sampler** reached over the
existing `host.docker.internal` bridge — the same pattern as host-native Ollama and the
zero-dep `collector/`.

## Architecture / data flow

```
host-agent/laam-host-metrics.mjs   (native on host, ZERO-DEP, binds 0.0.0.0:47600)
   │   samples every ~1s: os.cpus() delta → cpu%, os.mem → ram, `nvidia-smi` → gpus[]
   │   GET /metrics  →  HostMetrics JSON   (optional Bearer HOST_METRICS_TOKEN)
   ▼
/api/host/metrics   (Next route, auth-gated by session)
   │   fetch ${HOST_METRICS_URL}/metrics  (prod: http://host.docker.internal:47600,
   │                                       dev:  http://127.0.0.1:47600)
   │   fail-soft → 503 { error } when sampler unreachable (OCR-style)
   ▼
useHostMetrics()    (client hook: poll ~2s, rolling window ~60 samples, status flags)
   ▼
<HardwareAnalytics>  at the top of /machines (above the existing MachinesManager)
```

**Why a sampler, not GPU passthrough**: passthrough into Docker Desktop/WSL2 for a Blackwell
card is fragile and was already rejected. A ~80-line zero-dep sampler is the simpler path and
reuses proven infra (collector pattern + `host.docker.internal`).

## Data contract (`src/lib/host-metrics.types.ts`)

```ts
export interface GpuMetrics {
  index: number;
  name: string;
  utilPct: number;        // 0..100
  memUsedBytes: number;
  memTotalBytes: number;
  tempC: number;
  powerW: number | null;  // null if nvidia-smi omits power.draw
}
export interface HostMetrics {
  ts: number;             // epoch ms (sampler clock)
  cpu: { usagePct: number; cores: number; model: string };
  ram: { usedBytes: number; totalBytes: number };
  gpus: GpuMetrics[];     // [] when no NVIDIA GPU / nvidia-smi unavailable
}
```

v1 cards use `gpus[0]` (primary GPU). Multi-GPU is a future enhancement (the array supports it).

## Components (all NEW except a small insert into page.tsx)

| File | Responsibility |
|---|---|
| `host-agent/laam-host-metrics.mjs` | Zero-dep host sampler. Background 1s loop computes cpu% (os.cpus delta), ram (os.mem), gpus (`nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits`). Serves latest snapshot at `GET /metrics`. Optional `HOST_METRICS_TOKEN` bearer. Binds `0.0.0.0:${HOST_METRICS_PORT:-47600}` (reachable from container via host-gateway). |
| `src/lib/host-metrics.types.ts` | `HostMetrics` / `GpuMetrics` types + byte→GB helpers. |
| `src/app/api/host/metrics/route.ts` | Auth-gated proxy → `HOST_METRICS_URL`. Returns the JSON; 503 fail-soft when sampler down; forwards optional token. Short timeout (~3s). |
| `src/hooks/useHostMetrics.ts` | Client poll (~2s via setInterval, pause when tab hidden). Maintains rolling window (default 60 samples). Returns `{ current, history, status: 'ok'|'loading'|'unavailable' }`. |
| `src/components/machines/HardwareAnalytics.tsx` | Section container ("use client"). Header + badge, 4-card grid, realtime row. Renders unavailable/loading states. |
| `src/components/machines/MetricCard.tsx` | Reusable card: icon + title + big value + sub-stat + `<MetricGauge>`. Props: `{ label, color, valuePct, primaryText, subText, icon }`. |
| `src/components/machines/MetricGauge.tsx` | Semicircular gauge (recharts `RadialBarChart`, 180°). Brand color normally; ramps to amber `#f59e0b` >80%, red `#ef4444` >92% (load semantics, reuses status tokens). |
| `src/components/machines/MetricSparkline.tsx` | Realtime `AreaChart` over the rolling window with a per-series `<linearGradient>` fill (opacity 0.35→0). Used by the realtime row. |
| `src/i18n/dictionaries/machines.ts` | vi/en/zh strings for all new labels (`machines.hw.*`). |
| `src/app/machines/page.tsx` | Insert `<HardwareAnalytics/>` above `<MachinesManager/>`. Minimal, surgical. |
| `src/app/globals.css` | Add `--metric-gpu: #22d3ee;` and `--metric-vram: #38bdf8;` to the `@theme` block. |

## Layout & visual (bám style guide + ảnh mẫu)

**Section**: header "Phân tích phần cứng máy chủ" + a host badge (hostname, like the "System"
chip in ref 1). Card shell = existing idiom `rounded-xl border border-neutral-200 bg-white
shadow-sm dark:border-neutral-800 dark:bg-neutral-900` (or `.chart-card`).

**Row 1 — 4 metric cards** (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3`):

| Card | Color (token) | Gauge value | Big value | Sub-stat |
|---|---|---|---|---|
| CPU | `#6d5efc` (accent) | cpu.usagePct | `42%` | `8 cores · <model>` |
| GPU | `var(--metric-gpu)` `#22d3ee` | gpus[0].utilPct | `78%` | `<name> · 64°C` |
| VRAM | `var(--metric-vram)` `#38bdf8` | mem used/total % | `12.4 / 16 GB` | `78%` |
| RAM | `#8b5cf6` (accent-vivid) | used/total % | `18.3 / 64 GB` | `29%` |

Each card: lucide icon (`Cpu`, `Gpu`/`CircuitBoard`, `MemoryStick`, `MemoryStick`), semicircular
gauge, bold value (`text-2xl`), uppercase muted sub-label — matching the calm density of ref 1.

**Row 2 — Realtime trends** (`grid grid-cols-1 lg:grid-cols-2 gap-3`), each a `.chart-card`
with `ResponsiveContainer` (height ~200) over the rolling window:
- **Utilization**: GPU util + CPU util (2 series — cyan + indigo).
- **Memory**: VRAM% + RAM% (2 series — sky + violet).

Grouping compute vs memory mirrors the color grouping and matches ref 1's "real time
performance" pair. Dark mode via `useChartTheme`. Numbers use the same bold/uppercase treatment.

**Gauge states**: brand color fill; at >80% the arc switches to amber, >92% to red (existing
status tokens) so heavy load reads at a glance — like the Health/Temperature ramps in ref 1.

## Design tokens

- **Reuse**: accent `#6d5efc`, accent-vivid `#8b5cf6`; status ramp green `#22c55e` / amber
  `#f59e0b` / red `#ef4444` for gauge load states. No new gauge-ramp tokens.
- **New (2)**: `--metric-gpu: #22d3ee` (cyan-400), `--metric-vram: #38bdf8` (sky-400) — in the
  reference's purple→blue family, cohesive with the existing accent.
- **Gradients**: per-series recharts `<linearGradient>` defined in-component (no global token).

## Config / env

- App: `HOST_METRICS_URL` (compose prod `http://host.docker.internal:47600`; dev
  `http://127.0.0.1:47600`), optional `HOST_METRICS_TOKEN`. Add to `.env.example`,
  `docker-compose.yml` `app.environment`, and the standalone runtime.
- Sampler: `HOST_METRICS_PORT` (default 47600), optional `HOST_METRICS_TOKEN`. Documented run
  command; durability (run-at-startup) deferred to the existing P1 durability backlog, like
  Ollama/collector.

## Error / edge handling

- Sampler unreachable → route 503 → cards show a calm "Không lấy được số liệu phần cứng" state
  (not an error explosion). The rest of `/machines` (manager) is unaffected.
- No NVIDIA GPU / `nvidia-smi` missing → `gpus: []` → GPU & VRAM cards show "Không có GPU".
- Tab hidden → polling pauses (visibilitychange) to save cycles.
- All numbers formatted client-side (GB with 1 decimal, % integer).

## i18n

New `src/i18n/dictionaries/machines.ts` (vi/en/zh), namespace `machines.hw.*`
(e.g. `title`, `cpu`, `gpu`, `vram`, `ram`, `cores`, `utilization`, `memory`, `unavailable`,
`noGpu`, `realtime`). Wired via `useT(machinesDict)`.

## Coordination with the FE session (avoid collisions)

All new files live under new paths; the only shared edits are `src/app/machines/page.tsx`
(one insert), `src/app/globals.css` (2 token lines), `docker-compose.yml`/`.env.example`
(env). A Serena `comms/` note will declare these boundaries to the FE session before coding.

## Scope (YAGNI)

**v1**: host-only, ephemeral (no DB/history), no alerting, primary GPU only.
**Future**: multi-machine (via collector), persisted history (DB + SSE), threshold alerts,
disk/fan panels (ref 1), multi-GPU.

## Success criteria

- [ ] Host sampler returns valid `HostMetrics` (cpu%, ram, gpu util/vram/temp) on the host.
- [ ] `/api/host/metrics` returns sampler data when up; clean 503 when down (no crash).
- [ ] `/machines` shows 4 gauge cards (CPU/GPU/VRAM/RAM) updating ~every 2s, and 2 realtime
      trend charts, in both light and dark mode, responsive down to 440px.
- [ ] Works in the **production container** (reaches sampler via `host.docker.internal`).
- [ ] Sampler-down state degrades gracefully; existing MachinesManager untouched.
- [ ] 2 new tokens added; no other token churn; vi/en/zh strings complete.
- [ ] Test baseline stays green; new pure logic (parsing, formatting) is unit-tested.
