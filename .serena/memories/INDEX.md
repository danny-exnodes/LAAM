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
- [ocr-tesseract-docker](decisions/ocr-tesseract-docker.md) — OCR=Tesseract **bake vào image app** (`node:22-alpine`, `apk add tesseract-ocr + data eng/vie/chi_sim`), né UAC trên host. **Gotcha:** Alpine không kèm `eng` mà route mặc định `vie+eng+chi_sim` → phải thêm `eng`. Đã verify OCR ảnh tiếng Việt chuẩn. Handoff: `backlog/docker-stack-tesseract.md`.
- [responsive-conventions](decisions/responsive-conventions.md) — breakpoint `md` gập nav (**hamburger**, header client, dropdown overlay giữ 56px cho /chat); `p-4 sm:p-6`; lưới dày bọc `overflow-x-auto`; cột nhãn waterfall responsive.
- [auth-multihost-dev-env](decisions/auth-multihost-dev-env.md) — Vào dev qua hostname Tailscale (HTTPS `:8443`): **2 fix** — (1) `AUTH_URL` trong `.env.development.local` (Edge middleware bỏ qua Host→localhost); (2) `allowedDevOrigins` trong `next.config.ts` (Next chặn dev endpoint cross-origin → trang KHÔNG hydrate → form về GET → login đá về). Cả hai dev-only, prod Docker bỏ qua. **Đã verify login :8443 OK.**
- [next-pg-external](decisions/next-pg-external.md) — `serverExternalPackages:["pg"]` trong next.config.ts: fix `Module not found: Can't resolve 'pg'` (server component import `@/db` + standalone). Cần **restart dev** mới có hiệu lực; thêm native server-package khác cũng vào mảng này.
- [poc-host-and-ollama-ops](decisions/poc-host-and-ollama-ops.md) — Máy host (Ultra 9 285K/128GB/RTX 5070 Ti 16GB); hosting **2 tầng** (lõi Node+Postgres / AI Ollama+Tesseract, degrade nhẹ); Ollama ops 16GB (keep-alive, q8 fit, 30B+ tràn); Gemma 4 lineup.

- [agent-harness-architecture](decisions/agent-harness-architecture.md) — **Kiến trúc 6 lớp Agent Harness** (L0 orchestrator→L6 UX) + build order SP-1→SP-4. D1: hybrid dispatch hợp nhất, **connectors giữ nguyên**; internal tools đọc `agent_sessions/stats/machines` (lấp nghịch lý "AI mù dữ liệu LAAM"). Roadmap đầy đủ: `docs/superpowers/specs/2026-06-04-agent-harness-architecture.md`. Chờ user review chi tiết.

- [agent-harness-sp-analysis-plan](decisions/agent-harness-sp-analysis-plan.md) — **PM plan** đào sâu SP: song song tối đa **3 orch (SP-2/3/4)** sau **1 pass nền SP-1** (predecessor cứng), +1 reviewer tùy chọn. Nút thắt = SP-1 + băng thông review. User chốt: **main session làm SP-1 trước**.

## Rules (vận hành agent)
- [agent-ops-rules](decisions/agent-ops-rules.md) — ⛔ **KHÔNG tự ý chạy ngầm service nào** (dev/start/docker/ollama/preview) nếu user chưa cho phép; user tự host dev. Không `build` in-place khi prod đang chạy.

## Services
- [v2-app](services/v2-app.md) — Trạng thái app (root): routes, schema, phase status (P1-3 ✅, P4 Chat built chờ test), lib chính, việc chưa làm.

## Spec
- `docs/v2-plan.md` — kế hoạch/spec v2 đầy đủ (Phase 0→6).

## Backlog (v1 chưa migrate — làm sau ở v2)
- [next-steps](backlog/next-steps.md) — **handoff phiên sau**: nghiệm thu POC 4 nhiệm vụ · cài Tesseract (Admin) · độ bền (Windows Service) · v1-unported · vision enhancement · Phase 6.
- [docker-stack-tesseract](backlog/docker-stack-tesseract.md) — **handoff cho session docker**: chèn `apk add tesseract-ocr + data eng/vie/chi_sim` vào runner stage của Dockerfile (đã verify, chưa tự sửa Dockerfile của họ để tránh đè).
- [agent-harness-coordination](backlog/agent-harness-coordination.md) — **cảnh báo file dùng chung** cho 3 session: SP-1 sẽ refactor `/api/chat`; SP-4 đụng `components/chat/*`; connectors giữ nguyên. Roadmap chốt, chưa implement.
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
- **✅ Setup ĐANG CHẠY:** Postgres+11 bảng · app `:3000` · model `qwen3-vl:8b-instruct-q8_0` **100% GPU**. ⚠️ owner chưa đăng ký. **OCR/Tesseract:** giải pháp Docker đã verify (OCR ảnh tiếng Việt chuẩn trên `node:22-alpine`); chờ session docker bake vào image app — xem [ocr-tesseract-docker](decisions/ocr-tesseract-docker.md).
- **▶️ Kế hoạch tiếp theo:** [next-steps](backlog/next-steps.md).
