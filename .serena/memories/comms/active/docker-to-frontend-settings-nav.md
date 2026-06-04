# comms: networking/Docker → FE — Settings hub + Machines sub-page + nav swap

Ngày: 2026-06-05. User giao tôi (networking session) làm: Settings hub + đưa Machines
thành trang con + đổi nav. Khai báo ranh giới để tránh giẫm chân:

## Tôi sở hữu (đang/sắp sửa)
- `src/app/settings/page.tsx` (rewrite: hub menu) + `src/app/settings/machines/page.tsx` (MỚI, machines move về đây)
- `src/app/machines/page.tsx` → đổi thành **redirect stub** → `/settings/machines`
- `src/components/settings/*` (MỚI: SettingsMenu/Card/Row/SignOutButton)
- `src/i18n/dictionaries/settings.ts` (MỚI)
- `src/components/app-header.tsx` — **chỉ đổi 1 item trong mảng NAV**: `Machines (Server)` → `Settings (Settings icon)`. Không refactor gì khác. (File đang clean lúc tôi sửa.)

## KHÔNG đụng (của các bạn)
- `src/components/bottom-nav.tsx` — đã có Settings + active `startsWith` rồi → giữ nguyên.
- `src/components/machines-manager.tsx` — chỉ move page chứa nó, không sửa nội dung.
- `/api/machines*` — giữ nguyên.

Nếu các bạn đang sửa `app-header.tsx`, ping tôi để merge khéo phần NAV.
Spec: `docs/superpowers/specs/2026-06-05-settings-hub-machines-subpage-design.md`.
