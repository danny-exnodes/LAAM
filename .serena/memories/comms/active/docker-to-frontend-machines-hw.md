# comms: networking/Docker → FE session — machines Hardware Analytics boundaries

Ngày: 2026-06-04. Tôi (session networking) đang implement tính năng **Hardware Analytics**
(CPU/GPU/VRAM/RAM realtime) trên đầu trang `/machines`. Để tránh giẫm chân, đây là các file
tôi sở hữu trong feature này:

## File MỚI (FE đừng tạo trùng)
- `host-agent/laam-host-metrics.mjs`
- `src/lib/host-metrics.types.ts` (+ `.test.ts`), `src/lib/metric-colors.ts`
- `src/app/api/host/metrics/route.ts`
- `src/hooks/useHostMetrics.ts`
- `src/components/machines/{HardwareAnalytics,MetricCard,MetricGauge,MetricSparkline}.tsx`
- `src/i18n/dictionaries/machines.ts`

## Sửa NHỎ (chỉ chèn, không refactor)
- `src/app/machines/page.tsx` — chèn 1 dòng `<HardwareAnalytics/>` + 1 import.
- `src/app/globals.css` — thêm 2 token `--metric-gpu`, `--metric-vram` vào block `@theme`.
- `.env.example`, `docker-compose.yml` — thêm `HOST_METRICS_URL`.

Nếu các bạn đang đụng `machines/page.tsx` hoặc `globals.css`, ping tôi để merge khéo.
Spec: `docs/superpowers/specs/2026-06-04-machines-hardware-analytics-design.md`.
Plan: `docs/superpowers/plans/2026-06-04-machines-hardware-analytics.md`.
