# Checkpoint: technical-consultant — 2026-06-07

## What was done
- Nghiên cứu 2 công cụ ngoài: Streamdown (vercel) + browser-act/skills; đối chiếu code chat LAAM thực tế (MarkdownView/CodeBlock/ChatClient/MessageItem).
- Tư vấn 4 ý tưởng (A Streamdown / B browser-connector / C Skill Forge / D human-handoff); user chốt hướng.
- Ghi decision memory `decisions/streamdown-spike.md` (4 acceptance criteria + quy tắc spike + defer B/C/D) + cập nhật INDEX.md.

## Files changed
- `.serena/memories/decisions/streamdown-spike.md` (mới)
- `.serena/memories/INDEX.md` (thêm entry)
- `.serena/checkpoint/consultant-2026-06-07.md` (mới)

## Current state
- DUYỆT spike Streamdown (time-box 1–2 ngày), **chưa code gì**. Quick-win độc lập: fix `CodeBlock.tsx` hardcode `oneLight` (hỏng dark).
- B/C/D defer; B cần use case no-API thật mới mở discovery.

## Next steps
- Bắt tay spike Streamdown sau feature flag, song song MarkdownView, đo 4 criteria.
- Nếu spike > 2 ngày: làm interim Prism theme-aware cho CodeBlock trước.

## Blockers / Risks
- Rủi ro nhị phân: Shiki plugin của Streamdown có thể nuốt fence ```chart/```map trước khi route ChartBlock/MapBlock. Rớt → fallback react-markdown, KHÔNG hybrid.
- Local-first: phải verify Mermaid/Shiki không load asset qua cdnUrl (offline/$0).
