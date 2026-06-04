# Decision: Host hardware metrics via a zero-dep host sampler (not in-process)

**Date:** 2026-06-04 · **Author:** claude (tech-lead/infra)

## What & why
`/machines` now has a **Hardware Analytics** section (CPU/GPU/VRAM/RAM realtime).
The data CANNOT be read in-process by the Next server: prod runs in Docker, the
**GPU + nvidia-smi live on the host** (no GPU passthrough), and the container's
`os` view isn't the host's. So host metrics come from a **host-native sampler**
reached over `host.docker.internal` — same pattern as host Ollama + `collector/`.

## Architecture (v1: host-only, ephemeral, no DB)
- `host-agent/laam-host-metrics.mjs` — **zero-dep** (os + `nvidia-smi`), 1s loop,
  serves `GET /metrics` (HostMetrics JSON) on `0.0.0.0:47600`. Optional Bearer
  `HOST_METRICS_TOKEN`. Binds 0.0.0.0 so the container can reach it.
- `/api/host/metrics` — auth-gated proxy → `HOST_METRICS_URL` (prod
  `host.docker.internal:47600`, dev `127.0.0.1:47600`); fail-soft 503.
- `useHostMetrics()` — client poll ~2s, rolling window 60, pauses when tab hidden.
- UI: `components/machines/{HardwareAnalytics,MetricCard,MetricGauge,MetricSparkline}`.
  4 gauge cards (recharts RadialBarChart) + 2 trend area charts. Gauge load ramp:
  brand color → amber >80% → red >92% (existing status tokens).
- Tokens: `--metric-gpu #22d3ee`, `--metric-vram #38bdf8` (globals.css @theme) mirrored
  in `src/lib/metric-colors.ts` (recharts needs literal colors). System=purple,
  graphics=blue.

## Verified (2026-06-04, live)
Sampler real data (Ultra 9 285K 24c, 137GB RAM, RTX 5070 Ti util/VRAM 17GB/51°C).
Container reaches sampler via host.docker.internal ✓. Route protected (307→login
when unauth — metrics NOT public) ✓. `next build` + 810 tests green ✓.

## Env
`HOST_METRICS_URL` (compose prod = host.docker.internal; `.env` dev = 127.0.0.1),
optional `HOST_METRICS_TOKEN`. The sampler default port 47600.

## Scope / future
v1 = host-only, ephemeral, primary GPU. Future: multi-machine (collector), persisted
history (DB+SSE), threshold alerts, multi-GPU, disk/fan. See spec/plan
`docs/superpowers/{specs,plans}/2026-06-04-machines-hardware-analytics*`.
Durability: sampler must run persistently → [[host-metrics-sampler-durability]].
