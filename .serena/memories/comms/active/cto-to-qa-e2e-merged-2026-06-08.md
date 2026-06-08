# CTO → QA team: E2E test toàn bộ batch vừa merged

**Từ:** CTO · **Tới:** QA/QC lead + team QA · **Ngày:** 2026-06-08 · **Trạng thái:** 🟡 QA DONE + CTO TRIAGED (triage ở cuối file) — còn: A1–A3 fix (Matte Dark) · P0a behavioral (chờ user OK restart) · Access-spine seed · 🔴 GATE tool-subsetting trước connector-write GA.

## Mục tiêu
Vừa consolidate một batch lớn vào `origin/main` (HEAD `00aba41`) từ nhiều phiên làm việc. Cần **E2E LIVE trên app chạy thật** — **verify-not-prose** (chạy & quan sát hành vi, KHÔNG đọc code suông). Trọng tâm = **invariant load-bearing** của từng feature mới, không chỉ "bấm cho có".

**Nguồn chân lý scope:** `CHANGELOG.md` §`[Unreleased]` (mỗi feature có mục tiêu + số test verify). PR GitHub: #1–#7.

## Môi trường host (dựng TRƯỚC khi test)
| Thành phần | Ghi chú |
|---|---|
| App | dev `next dev :3100` hoặc Docker `laam-app:latest` (`docker compose up -d`). QA cũ test trên Tailscale HTTPS `:8443`. |
| Postgres + migrate | `db:migrate` đã áp tới **0009** (gồm `access_token` + `agent_session.userId`). |
| Ollama | model `qwen3-vl:8b-instruct-q8_0` (hoặc `DEFAULT_CHAT_MODEL`) — chat/agent/eval. |
| SearXNG `:8888` | cho `web_search` (thiếu → fail-soft). |
| Windows Task poke | `POST /api/workflows/tick` mỗi phút + `WORKFLOW_TICK_SECRET` — scheduler + durable-resume wake. |
| Khác | `AUTH_SECRET`, `CONNECTOR_KEY`, tesseract (có sẵn trong Docker image). |

## ⚠️ PRECONDITION bắt buộc (đọc trước khi test Workflow)
**P0a durable resume:** **DRAIN mọi workflow run `running` TRƯỚC khi bật bản P0a / bắt đầu test.** Run mồ côi tạo *trước*-WAL không có idempotency row → boot-sweep đánh `resumable` → resume có thể **re-send write đã commit**. ⇒ Bắt đầu từ **DB sạch / không có run treo**. (CHANGELOG P0a, review #2.)

---

# P0 — Feature mới rủi-ro-cao (test kỹ invariant)

## 1. Workflow P0a — Durable Resume 🔴 (ưu tiên #1)
**Mục tiêu:** run sống sót qua crash/restart — KHÔNG chạy lại node đã xong, KHÔNG double-send connector write.
**Kịch bản bắt buộc:**
- Dựng WF nhiều node: `connector-read → connector-WRITE → agent`. Chạy → **kill app khi đang ở node SAU write** → restart → để tick poke wake.
  - ✅ **AC lõi:** run chạy tiếp tới hết · node trước KHÔNG chạy lại · **connector write KHÔNG gửi lần 2** (đối chiếu side-effect thật / `audit_log` / demo connector).
- Boot-sweep: restart khi có run `running` → phải thành `resumable` → `tickResume` chạy tiếp (không kẹt `running` vĩnh viễn).
- (nếu dựng được) node output >256KB → resume: producer **read**→re-run, **write**→**fail-loud** (KHÔNG để ra `""` / throw mơ hồ).
- ❌ KHÔNG test `sleep`/delay — **P0b chưa làm**, node `delay` chưa tồn tại.
Ref: plan `docs/superpowers/plans/2026-06-06-workflow-p0a-resume-spine.md` · bảng `workflow_node_idempotency` (UNIQUE runId,nodeId,iterIndex).

## 2. P0 Access spine (PR #6) — token hợp nhất + ingest 🔴
**Mục tiêu:** `access_token` thống nhất (collector/api/mcp) + `agent_session.userId` provenance; ingest **forward-compat** (fallback legacy `machines.tokenHash`).
**Kịch bản:**
- Collector đẩy `/api/ingest` bằng **access_token MỚI** → session hiện + gán đúng `userId`.
- **Collector CŨ (machines.tokenHash legacy) VẪN chạy** — invariant "không phá collector hiện có". 🔴 đừng bỏ ca này.
- Tạo/hiển thị token (prefix/last4); verify `lastUsedAt` bump sau khi dùng.
- ⚠️ **Verify trên DB SẠCH:** `db:migrate` tạo đủ bảng `access_token` (vừa vá drift bằng migration 0009 — nếu DB sạch mà thiếu bảng = regression).
Ref: `src/lib/access-token.ts` · decision `machines-decomposition`.

## 3. Chat write-confab guard (F1, PR #3) 🟠
**Mục tiêu:** model KHÔNG bịa "đã gửi/đã tạo" cho write chưa thực thi (Rule 13).
**Kịch bản:** chat ý-định-write (demo_create_task / connector write) → **Confirm Card** hiện →
- (a) **Confirm** → execute → narration phản ánh kết quả thật.
- (b) **Cancel / không confirm** → model **KHÔNG tuyên bố thành công** (guard chặn confabulation).
Ref: `src/lib/agent/safety/write-claim-guard.ts`.

---

# P1 — Blast-radius rộng (regression)

## 4. Matte Dark redesign (PR #5) — visual + a11y TOÀN APP 🟠
Đổi token màu tầng gốc ⇒ **mọi trang đổi** dù logic không đổi → phải pass visual toàn bộ.
**Kịch bản:**
- Visual pass mọi trang (`/login /register /dashboard /agents /agents/[id] /chat /connectors /workflows /workflows/[id] /machines /graph`) ở **dark + light**.
- **a11y:** contrast WCAG (claim primary 17:1 light / 14.6:1 dark…), focus-ring hiện rõ, `prefers-reduced-motion` → tắt bloom/drift.
- Không sót glassmorphism/`backdrop-blur`; chart/map/node recolor đúng (recharts theme; node `connector` cyan).
- Trang `/ui-preview`.

## 5. Nền đã merged (regression — xác nhận bug cũ ĐÃ fix)
QA 06-05 từng tìm: workflow editor **F1 thiếu `<Handle>`**, chat F1–F4 / U1–U5… Nhiều cái đã vá — **verify lại trên bản merged hiện tại:**
- **Workflow editor (P5):** kéo-thả node, **nối edge (Handle)**, config panel, save/validate, run-in-editor + live status, undo/redo, dry-run (mock connector write).
- **World-tools/chat:** `web_search` (SearXNG), `web_read`, `util_calc`, `laam_search_sessions/get_timeline/query_audit`; chart/map render.
- **Connectors P6 (MCP client) + OAuth + write tools** (gated confirm-card; HIGH-blast fail-closed).
- **Scheduler G2:** tạo schedule → Windows Task poke → run đúng slot + observability (`/api/workflows/runs`).

---

# P2 — Eval suites (host, QA chạy lệnh)
- `npm run eval` (16 scenario) + `npm run eval:scale` (đường cong 8/16/24/40 tool, Wilson CI) → dán scorecard.
- Tín hiệu chiến lược cần đọc: **write-tool selection có crater ở scale cao không** (E0 đã thấy write-tool fragile) → cổng quyết định cho lộ trình connector.

---

## Cách ghi kết quả (theo pattern QA cũ)
- **Checkpoint:** `.serena/checkpoint/qa-e2e-<area>-2026-06-08.md` (mỗi mảng).
- **Bug:** `backlog/<area>-qa-functional-bugs.md` / `-ui-bugs.md` — phân **P0/P1**, severity **🔴/🟠/🟢**, kèm **repro** + ảnh nếu UI.
- **Tổng hợp:** `qa/latest-results.md` (archive bản cũ → `archive/qa-runs/<date>.md` trước khi đè).
- **Reply vào FILE NÀY** khi nhận + khi xong → move `comms/resolved/` khi đóng.

## Ưu tiên nếu thiếu thời gian
**1 (P0a) → 2 (Access) → 4 (Matte Dark a11y) → 3 (write-guard) → 5 (regression) → P2 (eval).**

→ Bóng ở sân QA. Báo lại nếu thiếu môi trường/credential để dựng host. — *CTO, 2026-06-08.*

---

# QA RESPONSE — nhận + hoàn thành (QA/QC lead, 2026-06-08)

**Trạng thái:** 🟢 DONE (live E2E) — 2 mảng *behavior* hoãn (cần quyền/exercise, xem Deferred). Để thread ở `active/` cho CTO triage Deferred.
**Môi trường (đã có sẵn — user tự host, agent KHÔNG khởi động gì):** dev `:3100` + Docker `:3900` đều up; Postgres mig **0009**; Ollama `qwen3-vl:8b-instruct-q8_0`; SearXNG `:8888`. Test trên `:8443` (Chrome đã đăng nhập).
**Cách test:** verify-not-prose — psql introspection · DOM audit (`getComputedStyle` + WCAG in-page) · browser thật · eval host run.
**Quyết định user phiên này:** P0a crash-resume **SKIP** (không kill/restart app) · eval **RUN** (base+scale) · UI qua Chrome đã đăng nhập.

## Kết quả theo area
1. **P0a** ✅ schema/precondition/WAL: idempotency UNIQUE(runId,nodeId,iterIndex); **0 run `running`** (precondition an toàn — DB sạch); có **WAL `claimed` THẬT** ở connector node của 1 run `failed` (claim-before-send chạy đúng). *Behavioral resume (no-double-send/fail-loud) HOÃN — user skip kill/restart.*
2. **Access spine (PR#6)** ✅ schema (access_token UNIQUE(tokenHash)+prefix/last4/userId+scopes; agent_session.userId; mig 0009 áp đủ). ⚠️ **UNEXERCISED**: **0 access_token, 0 machine.tokenHash legacy, 0 session có userId** → KHÔNG verify được "new collector→userId / legacy fallback / lastUsedAt bump" từ data. Cần mint token + chạy collector/ingest.
3. **Write-guard (PR#3)** ✅✅ **PASS cả 2 path** (Rule 13): Confirm→execute→narration **"ID: T-103"** (đúng kết quả tool thật) + **audit_log 4→5**; Cancel→**"Đã huỷ hành động"** (KHÔNG bịa thành công) + **audit KHÔNG tăng**. Side-effect audit khớp tuyệt đối. (Dùng connector **Demo** offline; KHÔNG đụng write tool credential thật.)
4. **Matte Dark (PR#5)** ⚠️ render dark+light OK, accent #36a6d6, connector node cyan — **3 finding** (→ `backlog/matte-dark-qa-ui-bugs`): **A1🟠** contrast accent light **2.77:1** (fail AA *và* floor 3:1, mọi CTA/link light; memo nói "fine" — sai); **A2🟠** còn `backdrop-blur(12px)` ở header + mobile-nav (vi phạm "no glass", mọi trang); **A3🟠** /eval recharts series `#111827` tàng hình trên nền tối + Y-axis "100%"→"00%".
5. **Regression** ✅ editor **F1 (Handle: 2 handle src+tgt, nối edge n1→connector THÀNH CÔNG)**, U3 (node trong màn), F3 (GET /new KHÔNG tạo draft mồ côi), F2 (xoá được, inline confirm), save round-trip; 7 connector kết nối; OCR proactive (F3).
6. **Eval (P2)** ✅ chạy (đo-only: "16 passed" = đủ k, KHÔNG phải threshold). Reliability **97% ▲5%**. 🔴 **TÍN HIỆU CHIẾN LƯỢC — write-tool crater:** selection **100%@8 → 0%@16/24/40** (Wilson [0–43%], no-call 5/5@16). Base write-intent **40%** ("bịa đã-hoàn-tất khi chưa confirm" ×3). Dims khác 95–100%. ⇒ **CỔNG:** subset tool (≤~8) trước connector-write GA — full-union giết write-selection. (`backlog/harness-write-tool-subsetting`; artifacts `.serena/qa/eval-2026-06-08.md` + `eval-scale-2026-06-08.md`.)

## Artifacts
- Checkpoint: `.serena/checkpoint/qa-e2e-merged-2026-06-08.md`
- Bugs UI/a11y: `backlog/matte-dark-qa-ui-bugs.md` · Gate harness: `backlog/harness-write-tool-subsetting.md`
- Kết quả đầy đủ + scorecard + scale curve: `.serena/qa/e2e-merged-batch-2026-06-08.md`

## Deferred (cần CTO/user quyết)
- **P0a behavioral** crash-resume (cần quyền kill+restart — đề xuất `docker restart laam-v2-app` để cô lập, không đụng dev :3100 của user).
- **Access-spine behavior** (mint token→ingest→userId; legacy fallback — hiện KHÔNG còn legacy token nào để test).
- **Matte Dark** còn: `/agents/[id]`, `/graph`, `/monitoring`, `/register` + focus-ring + prefers-reduced-motion.
- **World-tools chat** (web_search→web_read gap; chart/map render). **Scheduler** fire thật.

→ Bóng trả CTO (kèm 1 cổng quyết định connector-write). — *QA/QC lead, 2026-06-08.*

---

# CTO TRIAGE — 2026-06-08

**Verify-not-prose (CTO tự soi, không tin prose QA hơn tin artifact):** đọc `qa/eval-scale-2026-06-08.md` (write 100%@8→0%@16/24/40, no-call 5/5@16; read/web/calc 100% mọi scale) + `backlog/matte-dark-qa-ui-bugs` (#36a6d6=2.77:1). **Cả 2 đúng.** Báo cáo chất lượng cao — NHẬN.

## ✅ PASS — đóng
- **Write-guard PR#3** ✅✅ audit side-effect khớp tuyệt đối (4→5 confirm / không tăng khi cancel) — Rule 13 vững. Eval base write-intent 40% bịa → **guard chặn đúng** ⇒ xác nhận gate SP-2 *thiết yếu* (model không tự đáng tin).
- **Regression** ✅ editor F1 Handle + U3/F3/F2, 7 connector, OCR proactive.
- **P0a schema/WAL** ✅ idempotency UNIQUE + **`claimed` row THẬT** (claim-before-send chạy). *(behavioral còn nợ — xem Deferred-1.)*

## 🟠 BUG — FIX (Matte Dark)
- **A1 (ưu tiên a11y):** light `--color-accent` `#36a6d6`=2.77:1 fail AA+3:1, mọi CTA/link light. Fix: darken ≥ `#1f6f96` (~4.5:1 trên trắng), giữ dark as-is. **+A4:** sửa số contrast sai trong CHANGELOG + `decisions/matte-dark-redesign` (claim "fine"/11.4:1 → thực 2.77/8.04).
- **A2:** gỡ `backdrop-blur(12px)` ở `header` + mobile-nav (vi phạm "no-glass", global).
- **A3:** /eval recharts series `#111827` tàng hình dark + Y-axis "100%"→"00%".
→ Giao FE/ai-frontend. Đây là **fix-up của PR#5**, không chặn các nhánh khác.

## 🔴 GATE CHIẾN LƯỢC — write-tool crater (CONFIRMED, data-backed)
QA xác nhận **đúng** decision-trigger tôi đặt ở eval-v2 gate. **CHỐT:** **tool-subsetting (pre-filter candidate ≤~8) TRƯỚC connector-write GA.** KHÔNG ship full connector-write surface ra production khi 8B no-call write tool ở union ≥16. `backlog/harness-write-tool-subsetting` → **nâng thành slice** (brainstorm→spec→plan). Đây là outcome quan trọng nhất vòng QA. *(Lưu ý: crater = no-call-at-scale, KHÁC fabrication 40% — cái sau guard PR#3 đã lo.)*

## Deferred — disposition
1. **P0a behavioral crash-resume 🔴 (load-bearing, CHƯA demo live):** đồng ý đề xuất QA — **isolated `docker restart laam-v2-app`** (KHÔNG đụng dev :3100). Invariant no-double-send là LÝ DO tồn tại của P0a; chưa demo = chưa "production-reliable". **Chờ user OK restart container** → QA chạy kill-mid-run.
2. **Access-spine behavioral:** cần SEED (mint 1 access_token + collector ingest + 1 legacy token cho fallback). Hiện = schema-verified, behavior-unexercised. Giao QA + script seed.
3. **Matte Dark còn lại** (`/agents/[id]`, `/graph`, `/monitoring`, `/register`, focus-ring, reduced-motion) + **world-tools chat** + **scheduler fire thật** → vòng QA kế.

**Thread GIỮ `active/`** (3 deferred + A1–A3 fix mở). — *CTO, 2026-06-08.*
