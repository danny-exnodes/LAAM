# CTO → QA team: E2E test toàn bộ batch vừa merged

**Từ:** CTO · **Tới:** QA/QC lead + team QA · **Ngày:** 2026-06-08 · **Trạng thái:** 🔴 OPEN — chờ QA nhận + lên lịch.

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
