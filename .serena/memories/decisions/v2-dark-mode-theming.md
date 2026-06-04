# Decision/Discovery: v2 dark mode là MEDIA-QUERY (không phải class)

Ngày: 2026-06-03. Phát hiện khi sửa 11 lỗi parity (so v1). Tailwind 4 (root) mặc định dark mode theo `@media (prefers-color-scheme: dark)` — **KHÔNG có class `.dark`** trên `<html>` (layout.tsx không gắn). Hệ quả không hiển nhiên, dễ tái phạm:

## 3 cái bẫy (đã sửa, đừng lặp lại)
1. **Viền accent bị đè ở dark**: `border border-l-4 border-neutral-200 dark:border-neutral-800` + `border-l-<color>` → ở dark, `dark:border-neutral-800` (shorthand border-color cả 4 cạnh) **đè** màu trái. Card trông như "không có màu viền".
   → **Sửa = inline `style={{ borderLeftColor: hex }}`** (luôn thắng class). Dùng tông `-500` (vd running `#22c55e`, idle `#f59e0b`, done `#94a3b8`, stuck `#ef4444`, accent `#8b5cf6`) đọc tốt cả 2 mode. Xem `AgentCard.tsx`, `KpiGrid.tsx`.
2. **CSS `.dark .X` là CODE CHẾT**: globals.css từng có `.dark .chart-card` → không bao giờ match (không có class `.dark`) → chart-card **nền trắng** giữa dark mode. → Dùng `@media (prefers-color-scheme: dark) { .chart-card {…} }`.
3. **recharts không nhận Tailwind `dark:`** (render SVG màu literal). → hook `src/hooks/useChartTheme.ts` trả palette {grid, axis, tooltip} theo `matchMedia`, áp vào CartesianGrid `stroke`, XAxis/YAxis `tick.fill`, Tooltip `contentStyle`. **Phải guard `typeof window.matchMedia==='function'`** (jsdom không có → test vỡ).

## Quy tắc cho UI v2 sau này
- Card có accent trạng thái → inline borderLeftColor, đừng tin `dark:border-l-*`.
- Thêm chart recharts → dùng `useChartTheme()`.
- Cần `.dark .x` CSS → đổi sang media query (hoặc nếu sau này thêm theme-toggle thì mới chuyển cả app sang class-based + script set `.dark`).

## Vận hành liên quan
- **DB baseline reset làm rỗng bảng `user`** → mọi trang auth-gated (chat/agents/connectors/machines) "chết" vì không login được. Người đăng ký ĐẦU TIÊN = owner. Khi nghiệm thu v2 phải đăng ký 1 account trước.
- Liên quan: service [[v2-app]].
