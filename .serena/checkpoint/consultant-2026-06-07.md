# Checkpoint: technical-consultant — 2026-06-07

## What was done
- Nghiên cứu Streamdown + browser-act/skills; đối chiếu code chat LAAM; user chốt hướng (A spike, B/C/D defer).
- Ghi `decisions/streamdown-spike.md` (4 acceptance criteria) + INDEX.
- **Phase 2 Plan** `docs/superpowers/plans/2026-06-07-streamdown-spike.md`.
- **Phase 4 Implement** spike Streamdown sau feature flag (song song MarkdownView, đường cũ nguyên):
  - `StreamdownView.tsx` (override `components.code` route chart/map, delegate Shiki cho code thường, `shikiTheme:[light,dark]`).
  - `ChatMarkdown.tsx` switch theo `NEXT_PUBLIC_CHAT_RENDERER`; `MessageItem` đổi 1 import.
  - Quick-win độc lập: `CodeBlock` theme-aware + hook mới `useIsDark.ts`.
  - CSS wiring `globals.css` (@import styles.css + @source); `.env.example` flag.
  - Test `StreamdownView.test.tsx` (phán criteria 1).

## Files changed
- Mới: StreamdownView.tsx, ChatMarkdown.tsx, useIsDark.ts, StreamdownView.test.tsx, plan doc.
- Sửa: MessageItem.tsx, CodeBlock.tsx, globals.css, .env.example, package.json(+lock), decision memory, INDEX.

## Current state
- **Criteria 1 ✅ (rủi ro nhị phân giải tích cực, KHÔNG cần fallback) + 2 ✅** trong jsdom. **1122 test xanh, tsc sạch.**
- Scan tĩnh: streamdown **0 CDN ref khi render** (local-first OK trên giấy).
- Criteria 3 (no-flicker) + 4 (CJK) + dark-theme code + Mermaid offline = **chờ user verify runtime trên host** (agent không tự chạy dev/build).

## Next steps
- User bật `NEXT_PUBLIC_CHAT_RENDERER=streamdown`, mở /chat verify 3/4 + offline Mermaid + DevTools Network.
- Đậu hết → lên plan migration (thay hẳn, gỡ react-markdown path, cân nhắc Mermaid/KaTeX/CJK plugin, bundle).
- Sửa memory [[v2-dark-mode-theming]] lỗi thời (dark giờ class-based).

## Code review (2026-06-07, /code-review high) — 3 finding, đã sửa hết
- F1 (medium): `ChatMarkdown` static-import → flag-OFF vẫn bundle streamdown. Fix: `next/dynamic(ssr:false)` chỉ nạp khi flag bật (theo MapBlock). DCE khi flag tắt.
- F2 (low, Rule 9): test criterion-2 chỉ check textContent → siết assert `[data-streamdown="code-block"]` + `data-language="js"` (fail được khi Shiki regress).
- F3 (low, reuse): `useChartTheme` lặp detection → refactor consume `useIsDark`.
- Verify lại: 1122 test xanh, tsc sạch.

## Blockers / Risks
- 3/4 criteria cần host runtime — agent không tự chạy được.
- Bundle size streamdown (+mermaid/shiki) chưa đo — để khâu migration.
