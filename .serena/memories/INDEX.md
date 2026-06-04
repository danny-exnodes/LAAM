# Serena Memory Index — LAAM

> Đọc đầu mỗi phiên (Session Boot Protocol).

## Decisions
- [v2-architecture](decisions/v2-architecture.md) — Định hướng v2: **local-first** (không SaaS), giám sát **đa máy**, Next.js 16 + Postgres + Auth.js v5 + RBAC + Drizzle, **Gemma 4** chủ đạo, Tailscale, <50 user.
- [db-migrations](decisions/db-migrations.md) — Dùng **migration** (db:generate→commit→db:migrate), KHÔNG db:push; drizzle-kit không chạy trong sandbox agent.
- [auth-and-proxy](decisions/auth-and-proxy.md) — Auth.js `trustHost:true`; Next 16 `proxy.ts`; **GOTCHA: API public phải thêm vào isPublic** (auth.config.ts); RBAC + user đầu = owner.
- [monitoring-parser-reuse](decisions/monitoring-parser-reuse.md) — v2 tái dùng parser v0.9 (copy vào src/lib/monitoring); `upsertSessions` dùng chung local + ingest; transcriptPath chỉ live cho host.
- [v2-parity-gap](decisions/v2-parity-gap.md) — **v2 CHƯA parity v1** (Dash ~35%, Agents ~40%, Chat ~8%, Connectors 0%). Quyết định: port đầy đủ theo lộ trình `docs/v2-parity-roadmap.md` (Wave 0 hạ tầng → Agents → Dashboard → Chat → Connectors).
- [v2-dark-mode-theming](decisions/v2-dark-mode-theming.md) — dark mode v2 là **media-query** (không class `.dark`): viền accent phải inline `borderLeftColor`, chart recharts cần `useChartTheme`, `.dark .x` CSS là code chết. + reset DB làm rỗng `user` → đăng ký lại (đầu tiên = owner).
- [poc-model-choice](decisions/poc-model-choice.md) — POC dùng **1 model** `qwen3-vl:8b-instruct-q8_0` (chat+tool-call), **không smart-routing** (vốn chưa implement); OCR=Tesseract, vision chưa nối; set `DEFAULT_CHAT_MODEL` là đủ. Host: RTX 5070 Ti 16GB.
- [poc-host-and-ollama-ops](decisions/poc-host-and-ollama-ops.md) — Máy host (Ultra 9 285K/128GB/RTX 5070 Ti 16GB); hosting **2 tầng** (lõi Node+Postgres / AI Ollama+Tesseract, degrade nhẹ); Ollama ops 16GB (keep-alive, q8 fit, 30B+ tràn); Gemma 4 lineup.

## Services
- [v2-app](services/v2-app.md) — Trạng thái app (root): routes, schema, phase status (P1-3 ✅, P4 Chat built chờ test), lib chính, việc chưa làm.

## Spec
- `docs/v2-plan.md` — kế hoạch/spec v2 đầy đủ (Phase 0→6).

## Backlog (v1 chưa migrate — làm sau ở v2)
- [next-steps](backlog/next-steps.md) — **handoff phiên sau**: nghiệm thu POC 4 nhiệm vụ · cài Tesseract (Admin) · độ bền (Windows Service) · v1-unported · vision enhancement · Phase 6.
- [v1-unported](backlog/v1-unported.md) — Search/Office/proxy/`/api/config` + bảng events + lọc máy/owner + residuals. **Nguồn chân lý:** `docs/v1-to-v2-migration-handoff.md`. ⚠️ chưa xoá v1 (archive sau khi v2 production+nghiệm thu).

## Trạng thái hiện tại (2026-06-03)
- v2: P1 auth/RBAC ✅ · P2 monitoring ✅ · P3 collector đa máy (đơn giản) ✅ · P4 Chat Gemma 4 đã build, **chờ test runtime**. Verified live P1+P2+P3.
- App cũ (vanilla, Docker :4317) vẫn chạy; Phase 0 fixes (gemma4 default + toolbar) chưa deploy.
- DB dùng **migration**; user đã làm baseline sạch (→ `user` rỗng; phải đăng ký lại để dùng v2).
- **Parity-polish (Session 2, 2026-06-03)**: sửa 11 lỗi UI/chức năng v2 trên branch `fix/v2-parity-polish` — connector migrate, full-width, viền/chart dark, lucide-react, Agents drawer+waterfall trục thời gian. 375 test pass. **Chưa commit** (chờ user review).
- Checkpoint mới nhất: `checkpoint/claude-2026-06-04.md` (POC planning; trước đó 06-03 có Session 2)

## Trạng thái POC (2026-06-04)
- Chốt **host = máy này** (RTX 5070 Ti 16GB / Ultra 9 285K / 128GB), full features + GPU.
- Chốt **model POC = 1 model `qwen3-vl:8b-instruct-q8_0`** (Q8, 9.8GB), bỏ smart-routing; OCR=Tesseract; vision chưa nối. Xem [poc-model-choice](decisions/poc-model-choice.md).
- **✅ Restructure MERGED vào `main`** (PR #1 → `97968a4`): v2 lên root, v1 ở `archive/v1`. 375 test xanh.
- **✅ Setup ĐANG CHẠY:** Postgres+11 bảng · app `:3000` · model `qwen3-vl:8b-instruct-q8_0` **100% GPU**. ⚠️ Tesseract chưa cài (Admin), owner chưa đăng ký.
- **▶️ Kế hoạch tiếp theo:** [next-steps](backlog/next-steps.md).
