# Checkpoint: claude (landing implementation) — 2026-06-11

## What was done
- **Thực thi TOÀN BỘ plan** `docs/superpowers/plans/2026-06-11-landing-page-improvements.md` bằng
  subagent-driven development (implementer + spec review + quality review MỖI task; user duyệt option 1+3).
- **Branch `feat/landing-improvements`** (worktree `.claude/worktrees/landing-improvements`, base `39db22a`):
  22 commits — Phase A responsive (mech desktop-only ≥1100px → mobile dùng fallbackGrid; hamburger 768
  always-in-DOM `hidden`; svh; nowrap; grid 2 bước; low-vh layout) · Phase B content (HowItWorks thật own
  `#how`; SecuritySection + stats strip; copy trung thực vi/en/zh; HUD: badge minh hoạ + ảnh THẬT
  public/landing/*.png + 6-connector + 'VLM 8B' + pacing 280vh/0.72; CTA auth-aware Hero/Footer;
  metadata marketing + zoom riêng landing (NoZoom skip `/`); robots.ts + isPublic) · Phase C a11y/perf
  (`<html lang>` sync TOÀN APP; --faint 0.58 = 6.58:1 AA; transform-only anims + paused scanline;
  dot-field sprite cache + height-only resize).
- **Review bắt lỗi thật**: CRITICAL copy "mã hoá per-user" sai với code (crypto dùng 1 server key) → sửa
  thành "AES-256-GCM khi lưu trữ, cách ly per-user trong DB" (cả title b2); aria-controls dangling;
  mobileMenu ghost desktop; shotTop bị ảnh fill đè (z-index); test không thể fail (Rule 9) → gia cố red→green.
- **Ảnh sản phẩm thật**: account demo `danny.demo@exnodes.vn` (member, dev :3100), dashboard KPI thật +
  chat tiếng Việt render biểu đồ recharts; crop 680×192.

## Files changed
- Branch: 16 file src/components/landing/* + landing.module.css + i18n landing.ts(+test) +
  provider.tsx(+test) + no-zoom.tsx + app/page.tsx + app/robots.ts + auth.config.ts(+test) +
  public/landing/{shot-dashboard,shot-chat}.png. Main checkout KHÔNG đổi (chỉ .serena).

## Current state
- **1490/1490 test (231 file) + tsc exit 0** trên worktree. Mọi task qua 2 vòng review, APPROVED.
- Final whole-branch review đang chạy. CHƯA merge (checkout dùng chung — chờ user).
- CHƯA visual-verify trên browser: dev :3100 đang serve MAIN, không phải branch → cần user cho phép
  chạy dev server tạm trong worktree (vd :3101) hoặc user tự checkout sau merge.

## Next steps
- Nhận final review → trình user lựa chọn merge (finishing-a-development-branch).
- Sau merge: re-screenshot 390/768/1440 + Lighthouse (mục tiêu A11y ≥95) trên :3100; xoá worktree.
- Đề xuất theo dõi: userScalable merge behavior trên Android thật; star halo sáng hơn ~30% (sprite trade-off).

## Blockers / Risks
- Visual verify chặn bởi rule không tự chạy server (chờ user).
- 2 fix-agent chết giữa chừng (đã phát hiện qua git status, hoàn tất tay) — pattern cần để ý.

## UPDATE — cùng phiên: MERGED + VERIFIED (user duyệt "merge về main")
- ✅ Merge no-ff `eac5ddb` (0 conflict) · verify TRÊN MAIN: **1492/1492 test + tsc 0**
  (baseline main trước merge 1481/1481 — zero regression). Docs commit `eaa497d` (CHANGELOG + serena + plan).
- ✅ Worktree removed an toàn (junction rmdir trước), branch deleted, node_modules nguyên vẹn.
- ✅ Visual verify trên :3100 (Turbopack hot-reload): mobile 390 đi nhánh GRID (explode=false), panel đọc rõ
  + ảnh thật + badge minh hoạ; hamburger aria-expanded/hidden hoạt động; 6 anchor đủ; desktop 280vh OK.
- ✅ **Lighthouse mobile: 100/100/100/100 (50/50 audit)** — từ 89/100/91/67. 2 fix chót trên main `7d8f1a9`:
  label-in-name nút zh (WCAG 2.5.3) + `userScalable: true` tường minh (viewport MERGE từ layout — đúng cảnh
  báo reviewer B6; bài học: page-level viewport export phải set tường minh field muốn override).
- Screenshots before/after: `.claude/tmp/landing-eval-shots/` (after-* + lh-final/). CHƯA push origin (chờ user).
