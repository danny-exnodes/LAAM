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

- [agent-harness-sp2-actions-safety](decisions/agent-harness-sp2-actions-safety.md) — **SP-2 spec:** gate write = lớp bọc `withSafety` quanh dispatch (**zero đổi hợp đồng SP-1**); token niêm phong = `encryptJson` tái dùng connector crypto (stateless, TTL 5'); resume execute signed write **1 lần** + text-only (chống double-execute, Rule 13); redact+bound connector (vá lỗ hổng L4); audit qua `audit_log` sẵn có. Write surface hiện tại = **1 tool** `trello_create_card` (YAGNI: khung an toàn, không thêm write). Chờ lead re-review §6.

- [agent-harness-sp3-memory-proactive](decisions/agent-harness-sp3-memory-proactive.md) — **SP-3 spec:** persist tool turns = bảng mới `chat_tool_call` (chat_message KHÔNG đổi); summarize hội thoại dài (cột `summary`+watermark, model sinh, giữ nguyên văn lượt gần); proactive stuck/cost **in-chat** (compose quanh `buildSystemPrompt`, dedupe `proactiveState jsonb`, cost-alert tuyệt đối/burn-rate — không phải spike windowed). **Migration `0003` ADDITIVE** (SP duy nhất đụng schema). Token-undercount→backlog SP-1. Verdict A1–A4 chủ SP-1 đã chốt (`comms/resolved/sp3-to-lead-design-review`). Chờ user review.

- [agent-harness-sp4-ux-feedback](decisions/agent-harness-sp4-ux-feedback.md) — **SP-4 spec (UX feedback, L6):** stream tool events (trace ✓/✗ + args) + citations ("Nguồn: …") ra chat; frame protocol chung `src/lib/chat/frames.ts` (**envelope U+001E**, SP-2 dùng `pending_write`); **Gộp** nay / Trực-tiếp sau (server-only, protocol+FE bất biến theo thời điểm); redaction **set-membership** `INTERNAL_TOOLS`; citations từ `convo` (verdict A1, không đổi `ToolEvent`); ephemeral nay → bền qua `chat_tool_call` SP-3 sau. §3/§6 đã verify độc lập; chờ lead ACK migrate token-frame + spec §2 drift. **Spec viết xong, chờ user review.**

- [harness-reliability-eval](decisions/harness-reliability-eval.md) — **Phase Reliability/Eval (lát 1):** `npm run eval` live scorecard 6 chiều (selection/args/ground/restraint/term/write) × ~10 scenario, k-runs sampler prod, stub-output (không seed-DB), **vitest-project riêng (zero devDep)**. Đo trước F2/internal-tools, không fix. Spec `docs/superpowers/specs/2026-06-05-harness-reliability-eval-design.md`. Chờ user review.
- [workflow-orchestration-architecture](decisions/workflow-orchestration-architecture.md) — **AI Workflow Orchestration (MỚI, user đã ký 06-05):** nền tảng automation TRÊN harness; entity=node (connector+agent), engine tuyến tính A0→+condition/foreach (hoãn DAG), agent **read-only** + write=node tường minh (#3 chốt *loại-action*, KHÔNG chốt nội dung/đích), blast-radius gate scheduled (manual-preview=SP-2 tái sinh), scheduler **DB-claim atomic** + Windows Task poke, snapshot-on-run, template moat-leaning. 5 PIN load-bearing. Spec: `docs/superpowers/specs/2026-06-05-ai-workflow-orchestration-design.md`. Phasing A0(slice mỏng)→E. **Chờ user đọc spec trước A0.**

- [connectors-oauth](decisions/connectors-oauth.md) — **Google OAuth in-app (06-06, commit 1a721d7, branch `feat/connectors-oauth-expansion`, chưa merge):** 1 app External+Testing, **per-connector grant**, không đổi schema; 7-day reconnect tri-state (né CASA); flow authorize→shared callback, PKCE+state cookie mã hoá; refresh trong `execute()` (chokepoint chat+workflow). **`ConnectorTool.kind` tự khai → policy suy từ registry** (bỏ CONNECTOR_WRITES/READS, write-ready). **Đã build TRỌN P1–P5** (OAuth merged vào main; P2/P4b/P5 commit 798e160 branch `feat/connectors-p2-p5`): +21 tool/6 connector, **write surface 11 tool** (gated confirm-card + HIGH-blast fail-closed workflow), nội dung connector i18n vi/en/zh. tsc sạch, **922 test xanh**. Còn lại = operator setup Google Console + env để live; write tool cần re-consent write-scope.

- [matte-dark-redesign](decisions/matte-dark-redesign.md) — **Platform redesign "Matte Dark" (06-07, branch `claude/platform-glass-design-redesign-BADTM`):** user **bỏ glassmorphism** (no translucency/backdrop-blur) → matte opaque surfaces + ambient gradient + bloom; accent **#36a6d6** (cyan, thay tím), base #001616; **a11y ràng buộc cứng**; light giữ-chạy-được. Đợt này chỉ **token + primitives** (`globals.css` tokens, `components/ui/{MatteCard,Bloom,MatteButton}`, preview tạm `/ui-preview`), **chưa đụng 9 trang**. 1125 test xanh. Rollout cuốn chiếu sau.

- [streamdown-spike](decisions/streamdown-spike.md) — **Streamdown spike (06-07, DUYỆT, chưa migration):** thay renderer chat (react-markdown→Streamdown) giải nhấp-nháy-stream + dark code + CJK + Mermaid. Rủi ro **nhị phân**: chặn fence ```chart/```map trước Shiki plugin? **4 acceptance criteria** (chart/map · Shiki dark · no-flicker · CJK) — sau feature flag, song song MarkdownView, rớt (1)→fallback react-markdown KHÔNG hybrid. Verify local-first (no cdnUrl)/bundle/shadcn-token. Quick-win tách: fix `CodeBlock` oneLight dark-mode. **Defer B (browser-act, cần use case no-API thật)/C (Skill Forge→workflow-template)/D (human-handoff→ProactiveCard).**
- [world-tools-layer](decisions/world-tools-layer.md) — **World-Tools Layer (IMPLEMENTED 06-06):** họ tool `web_*` (web_search SearXNG self-host $0 + web_read promote fetch-url) · `util_*` (util_calc) · mở rộng `laam_*` (search_sessions/get_timeline/query_audit). Gộp vào `INTERNAL_TOOLS`, **0 migration, 0 đổi hợp đồng SP-1**, read-only qua gate SP-2. TDD đầy đủ, tsc sạch. Spec `docs/superpowers/specs/2026-06-06-world-tools-layer-design.md`. Followups: [[world-tools-followups]].

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
- [agent-harness-route-merge-reconciliation](backlog/agent-harness-route-merge-reconciliation.md) — **SP-2 + SP-3 cùng viết lại `/api/chat/route.ts`** từ base `12a97d7` → merge = 3-way thủ công (4 điểm reconcile + gap persist confirm-path). Migration `0003` = hard gate. Mở từ review code SP-2/SP-3 (lead, 2026-06-05).
- [agent-harness-sp2-fe-confirm](backlog/agent-harness-sp2-fe-confirm.md) — **handoff FE:** SP-2 gate write giao wire contract confirm card (frame `{t:"pending_write"}` + POST `/api/chat {confirm}`); FE sở hữu `components/chat/*` thêm card + router frame (phối hợp SP-4). SP-2 không tự sửa FE.
- [v1-unported](backlog/v1-unported.md) — Search/Office/proxy/`/api/config` + bảng events + lọc máy/owner + residuals. **Nguồn chân lý:** `docs/v1-to-v2-migration-handoff.md`. ⚠️ chưa xoá v1 (archive sau khi v2 production+nghiệm thu).

### QA E2E Chat (2026-06-05) — ✅ **ĐÃ XỬ LÝ TOÀN BỘ 12 mục (code)** — lead, 2026-06-05 (`checkpoint/lead-2026-06-05.md`; 540 test xanh, tsc sạch, **chưa commit**). Findings gốc: `checkpoint/qa-e2e-chat-2026-06-05.md`. **Còn lại = runtime-verify** (model emit chart/map; OCR cần Docker/native; bật connector Demo test write-gate).
- [chat-qa-functional-bugs](backlog/chat-qa-functional-bugs.md) — **F1** slash inert · **F2** chart/map không render (0 geo-tool call) · **F3** OCR chết (thiếu tesseract) · **F4** title lẫn byte file đính kèm.
- [chat-qa-ui-bugs](backlog/chat-qa-ui-bugs.md) — **U1** composer lệch 144px + tràn sidebar (`<section>` thiếu `relative`, fix 1 dòng) · **U2** branding "Gemma" sai (model=qwen3) · **U3** nút header (theme/sync/account) không i18n.
- [chat-qa-feature-upgrades](backlog/chat-qa-feature-upgrades.md) — quản lý conv (bulk/pin/group/dedupe/search nội dung) · proactive thành card · export PDF + token/cost · panel đính kèm · demo connector write-gate.
- [chat-qa-ux-improvements](backlog/chat-qa-ux-improvements.md) — sample-prompt auto-send · URL input inline (bỏ `window.prompt`) · tên model động · nút cuộn-đáy · trạng thái gọi tool · a11y message actions.

### QA E2E Workflow (2026-06-05) — QA/QC lead chạy **9/9 kịch bản live** trên dev :8443 (Demo connector bật, Ollama). Checkpoint: `checkpoint/qa-e2e-workflow-2026-06-05.md`. **Bản bàn giao dev:** `docs/workflow-qa-report-2026-06-05.md`. Engine/scheduler/templates/clone/blast-gate **PASS**; **editor có 1 bug chí mạng F1**.
- [workflow-qa-functional-bugs](backlog/workflow-qa-functional-bugs.md) — **F1🔴** editor thiếu `<Handle>` (không nối node / edge vô hình → không dựng workflow nhiều-node qua canvas) · F2🟠 không xoá được workflow (no DELETE) · F3🟠 `/workflows/new` insert trên GET (draft mồ côi) · F4🟠 run fail im lặng (UI bỏ qua res.ok + run trả 200).
- [workflow-qa-ui-bugs](backlog/workflow-qa-ui-bugs.md) — U1🟠 React key console (`WorkflowDetailClient` `<>` thiếu key) · U2🟠 `NodeConfigPanel` hardcode ngoài i18n · U3🟠 node mới rơi ngoài màn hình · U4/U5 nhỏ (ngày vi-VN, ✓/✗ schedule).
- [workflow-qa-feature-upgrades](backlog/workflow-qa-feature-upgrades.md) — xoá workflow · quản lý schedule (xoá/tắt/sửa) · editor: xoá node/cảnh báo chưa lưu/form condition-foreach/picker connector · huỷ run.
- [workflow-qa-ux-improvements](backlog/workflow-qa-ux-improvements.md) — toast run · markdown step output · nhãn step thân thiện · detail load chậm · validate message · Rule 13 digest LLM-reproduced.

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
