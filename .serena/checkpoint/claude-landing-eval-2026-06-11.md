# Checkpoint: claude (landing eval + plan) — 2026-06-11

## What was done
- **Đánh giá khách quan trang home `/`** theo yêu cầu user (đa góc nhìn → kế hoạch cải tiến responsive + show điểm mạnh):
  - Chụp 11 screenshot baseline 3 viewport (390/768/1440) từ dev :3100 đang chạy sẵn (không tự khởi động gì).
  - Workflow 6-lens (UX/IA · Visual · Responsive · A11y · Content · Perf), 30 agent, adversarial verify từng P0/P1:
    **22 confirmed / 2 refuted**. Điểm: UX 5.5 · Vis 6.5 · **Rsp 4** · A11y 6 · Cnt 6 · Perf 7.
  - Lighthouse mobile trên prod :3900: A11y 89 / BP 100 / SEO 91; fail color-contrast (--faint 3.69:1),
    meta-viewport (zoom khoá toàn app — CHỦ ĐÍCH, có NoZoom), robots.txt 307→/login (isPublic gotcha).
- **Viết plan thực thi đầy đủ** (writing-plans): worktree → responsive (mech desktop-only ≥1100px,
  hamburger 768, svh, nowrap) → content (HowItWorks thật cho #how, SecuritySection + stats strip,
  zero-instrumentation pitch, search/map cards, badge "số liệu minh hoạ", auth-aware CTA, metadata,
  robots.ts) → a11y/perf (`<html lang>` sync — lỗi TOÀN APP, --faint 0.58, transform animations,
  dot-field sprite cache).

## Files changed
- Create: `docs/superpowers/plans/2026-06-11-landing-page-improvements.md` (plan, ~14 task TDD)
- Create: `.serena/qa/landing-eval-2026-06-11.md` (báo cáo đầy đủ 6 lens + verdict)
- Create: `.serena/memories/backlog/landing-improvements.md` · Modify: `.serena/memories/INDEX.md` (+1 dòng backlog)
- Screenshots baseline: `.claude/tmp/landing-eval-shots/*.png` (tạm, dùng so sánh sau khi sửa)
- KHÔNG sửa source code nào.

## Current state
- Đánh giá + plan hoàn chỉnh, **chưa implement** — chờ user duyệt plan và chọn cách thực thi
  (subagent-driven / inline). Dev :3100 + prod :3900 không bị đụng.

## Next steps
- User duyệt plan → thực thi theo Task 0 (worktree `feat/landing-improvements`) trong plan.
- 2 quyết định cần user: (1) mở pinch-zoom TOÀN APP hay chỉ landing (plan mặc định chỉ landing);
  (2) chụp ảnh sản phẩm thật cho HUD panel (cần account đăng nhập trên :3100).

## Blockers / Risks
- Checkout dùng chung nhiều team → plan bắt buộc worktree, không tự merge.
- Finding đã BÁC, đừng làm lại: "THREE Context Lost = leak" (là cleanup chủ động của R3F);
  "write 0%@16+ crater" không liên quan trang này.
