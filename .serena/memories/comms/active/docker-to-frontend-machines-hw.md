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

---
## UPDATE (networking) — fixed a pre-existing hydration bug in machines-manager.tsx
`machines-manager.tsx:114` rendered `new Date(m.lastSeen).toLocaleString()` (no
locale/tz) → SSR (server en-US/UTC) != client (browser vi/Asia-Saigon) → React
hydration mismatch on the "lần cuối …" line (worse in prod: container UTC vs
browser +07, off by 7h). Fixed with a new deterministic helper **`fmtDateTime`**
in `src/lib/format.ts` (pins vi-VN, 24h, Asia/Ho_Chi_Minh). Bug pre-dated current
work (blame 36ad18c0); file was clean so no collision.
**FE please use `fmtDateTime(ts)` for any SSR-rendered timestamp** (server-component
data shown in a client component) to avoid this class of hydration error. Note:
`format.ts:ago()` uses Date.now() — fine only if rendered client-only.
