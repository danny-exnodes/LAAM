# Decision: Tên mở rộng "LAAM" — canonical "Life AI Assistant Monitoring" vs UI mô tả

**Date:** 2026-06-23 · **Role:** CTO · **Status:** DECIDED (phạm vi "Docs only"). Liên quan [[ecosystem-hermes-allocation]], [[laam-daab-consumer-posture]].

## Quyết định
- **Tên mở rộng canonical của LAAM = "Life AI Assistant Monitoring"** (CTO chốt, ghi ở parent `D:\Projects\NewEcoSystem\CLAUDE.md`). Trước đây docs ghi "Local AI Agent Monitoring".
- **Phạm vi đổi = CHỈ docs nội bộ:** `CLAUDE.md` (Project Overview) + `README.md` (tiêu đề) → "Life AI Assistant Monitoring". ĐÃ áp dụng.
- **GIỮ NGUYÊN chuỗi user-facing (cố ý — KHÔNG phải bug):**
  - `src/app/layout.tsx` `<title>`: "LAAM v2 — Local AI Agent Monitoring"
  - `src/i18n/dictionaries/common.ts` `brand.sub` + `src/i18n/dictionaries/landing.ts` `hero.eyebrow`: en "Local AI Agent Monitoring" / vi "Giám sát AI Agent cục bộ" / zh "本地 AI 智能体监控"
  - **Lý do:** đây là **marketing copy mô tả đúng sản phẩm** (giám sát Claude agent chạy local); tên mới "Life AI **Assistant** Monitoring" mô tả thứ khác với chức năng thực + thông điệp landing ("watch your agents come alive").

## ⚠️ Cho agent tương lai
KHÔNG "reconcile" chênh lệch docs↔UI bằng cách revert. Docs dùng tên canonical mới; UI **cố ý** giữ copy mô tả cũ. Chỉ đổi chuỗi UI khi CTO quyết **rebrand sản phẩm** (kèm dịch lại vi/zh + page title).

## Không đụng (lịch sử / kỹ thuật)
`.serena/qa/*`, `docs/superpowers/specs+plans/*`, `.claude/tmp/*` = hồ sơ point-in-time, giữ nguyên. User-Agent geocode `"LAAM-chat/0.1 (local AI agent monitoring; self-host)"` = định danh kỹ thuật (route/reverse/geocode), không đổi.
