# Backlog: Landing page (`/`) — cải tiến theo đánh giá 6-lens 2026-06-11

**Trạng thái:** ✅ **MERGED vào main `eac5ddb`** (2026-06-11, no-ff, 0 conflict; user duyệt).
Verify TRÊN MAIN sau merge: **1492/1492 test + tsc 0** (baseline main trước merge 1481/1481 — không regression).
Worktree đã remove an toàn (junction rmdir trước), branch đã xoá. CHANGELOG đã ghi mục [Unreleased].
Mọi task qua 2 vòng review + final whole-branch review (CRITICAL copy per-user-encryption fix ở 3 vị trí).
Checkpoint: `checkpoint/claude-landing-impl-2026-06-11.md`.
Còn theo dõi: Android userScalable merge behavior (real device) · star halo ~30% sáng hơn (sprite trade-off, có comment) · key `a11y.bg/a11y.mech` orphan (pre-existing, dọn sau) · visual verify đã làm trên :3100 sau merge (xem checkpoint).

- **Báo cáo đánh giá đầy đủ:** `.serena/qa/landing-eval-2026-06-11.md` (22 finding confirmed / 2 refuted; điểm UX 5.5 · Vis 6.5 · Rsp 4 · A11y 6 · Cnt 6 · Perf 7).
- **Plan thực thi:** `docs/superpowers/plans/2026-06-11-landing-page-improvements.md` (Task 0 worktree → A1-A3 responsive → B1-B7 content → C1-C4 a11y/perf → D verify).

## Tóm tắt P0/P1 chính
- **P0:** mech exploded section vỡ hoàn toàn ở mobile/tablet (6 HUD panel absolute không có mobile layout → chồng đè; WCAG 1.4.10). Fix: desktop-only ≥1100px, viewport hẹp dùng fallbackGrid sẵn có.
- **P1 responsive:** nav mất hẳn dưới 820px (không hamburger — trái responsive-conventions), CTA wrap 2 dòng, sticky 100vh≠dvh, desktop 900px-height panel giao nhau.
- **P1 content:** anchor #how trỏ nhầm (không có section how-it-works thật); thiếu pitch zero-instrumentation (điểm khác biệt mạnh nhất); thiếu Search/map/OCR-3-ngữ/cancel-run; telemetry HUD là số giả không nhãn; không có ảnh sản phẩm thật.
- **P1 a11y:** --faint 3.69:1 fail AA (Lighthouse xác nhận); `<html lang>` không sync khi đổi ngôn ngữ (lỗi TOÀN APP, provider.tsx); zoom bị khoá toàn app (layout.tsx+NoZoom — plan chỉ mở cho landing, app-wide chờ user quyết).
- **P1 perf:** scanline/cue animate `top` (layout) vô hạn; dot-field cấp phát ~10k gradient/s.
- **Đã bác (đừng làm lại):** "THREE Context Lost khi resize là leak" — là cleanup chủ động của R3F.

## Việc còn lại sau khi plan chạy xong
- Ảnh sản phẩm thật vào HUD panel (cần dev server + account để chụp — Task B4 Step 4 conditional).
- User quyết: mở zoom toàn app? đổi nhãn nav #stack? section so sánh chi phí/FAQ (đã defer)?
- P2 defer: prefetch Mech3D, nâng three/fiber (Clock deprecated), palette teal theo Matte Dark rollout.
