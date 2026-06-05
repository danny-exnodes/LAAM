# AI Workflow Orchestration — Handoff (CTO review + QA E2E)

**Ngày:** 2026-06-05 · **Trạng thái:** code hoàn tất + merged vào `main`, full suite xanh. Backend verify đầy đủ; **2 trang UI build "mù" (không chạy được dev server lúc build) → cần QA trực quan.** Migrations + Windows Task poke = host steps chưa chạy.

Tài liệu thiết kế đầy đủ: `docs/superpowers/specs/2026-06-05-ai-workflow-orchestration-design.md` + các plan `docs/superpowers/plans/2026-06-05-ai-workflow-{g1,g2,g3,E,D}*.md`. Quyết định kiến trúc: `.serena/memories/decisions/workflow-orchestration-architecture.md`. Diễn biến: `.serena/checkpoint/claude-workflow-2026-06-05.md`.

---

## 1. Feature là gì
Nền tảng automation: xâu chuỗi node thành workflow chạy được, có lịch/recurring, log từng run, template, trang quản lý realtime, editor kéo-thả. Xây TRÊN Agent Harness (chat Ollama nội bộ). 2 loại node "thực thi": **connector** (gọi `connectors.execute`, xác định) và **agent** (1 lần gọi harness Ollama với prompt + internal LAAM tools). Cộng 2 node điều khiển: **condition** (rẽ nhánh) + **foreach** (lặp).

Đáp ứng 7 yêu cầu gốc: ① chuỗi agent+orchestrator (engine) · ② kéo-thả + entity connector (editor + connector node) · ③ custom entity bằng prompt (agent node) · ④ giờ chạy + recurring (scheduler cron) · ⑤ log mỗi run (`workflow_run_step`) · ⑥ template + clone · ⑦ trang quản lý realtime.

## 2. Kiến trúc / footprint
- **Lib** (`src/lib/workflow/`, 14 file + test): `types` · `interpolate` (`{{path}}`, sink-typed) · `validate` (`assertRunnable`: tuyến tính + condition-branch + foreach-body, no fan-in/cycle) · `predicate` (comparator + all/any) · `engine` (recursive walker + budget) · `executors` · `runtime` (shared buildRunNode + blast gate) · `run` (snapshot + persist + SSE + finalize) · `schedule` (tickClaim atomic + tickExecute) · `cron` (hand-rolled 5-field) · `ollama` · `templates` · `tick-auth` · `editor/graph-serde` (React Flow round-trip).
- **API** (`src/app/api/workflows/`, 10 route): `route` (POST create + GET list) · `[id]` (GET + PATCH) · `[id]/run` (manual trigger) · `[id]/clone` · `templates` (GET) · `templates/[id]/instantiate` · `runs` (list) · `runs/[id]` (detail+steps) · `schedules` (GET/POST) · `tick` (machine-auth, claim+execute).
- **UI:** `/workflows` (list) · `/workflows/[id]` (detail: runs/steps log + schedule + run-now) · `/workflows/[id]/edit` (React Flow editor) · `/workflows/new` (blank). Components `src/components/workflows/*`. SSE realtime qua `/api/events` (forward `workflow_*`) + `useWorkflowEvents`. i18n `src/i18n/dictionaries/workflows.ts` (vi/en/zh).
- **DB:** `workflow` · `workflow_run` (+`graphSnapshot`/`scheduleId`/`scheduledFor`) · `workflow_run_step` · `workflow_schedule`. Migrations **0004** (workflow A0) + **0006** (scheduler). (0005 = eval_run, session khác.)

## 3. CTO review — phase → commit
| Phase | Commit merge | Reviewer | Ghi chú |
|---|---|---|---|
| A0 (slice) | (phiên trước) | opus | manual + 1 agent + 1 connector + log + SSE |
| G1 engine v2 | `60a5a2a` | opus adversarial (7 invariant + 8 probe) | condition/foreach/budget |
| G2 scheduler | `6f4e760` | opus adversarial — **bắt 1 BLOCKING** | atomic claim (PIN-D1) + cron + blast gate |
| G3 templates | `832029f` | sonnet | 2 moat template + clone (ownership-safe) |
| E mgmt page | `9c454b8` | sonnet (SSE no-regression ✓) | + 2 fix (dead link, nav over-reach) |
| D editor | `851c13f` | sonnet (round-trip true-inverse) | React Flow + serialization |

**Quyết định & sai lệch cần CTO chú ý:**
- **Bounding** = step/foreach cap (token-precise hoãn — tránh đổi hợp đồng `runNode` của A0). Vẫn chặn runaway.
- **condition không reconverge** (cây, no fan-in) — DAG/merge hoãn.
- **Blast-radius v1 = LOW-only mọi nơi** (`demo_create_task` = LOW; write khác = HIGH → fail-closed). *Hệ quả:* moat template hiện read-heavy; sink ngoài thật (Slack/Drive write) = connector-write tools tương lai.
- **Manual `BLAST_HIGH`** = PIN-6 (suspend-continue) hoãn — KHÔNG tái dùng được suspend của SP-2 (chat-turn semantics, đã verify).
- **Cron tz = server-local** (DST hoãn); bad-cron schedule auto-disable.
- **Tick auth:** localhost OR `WORKFLOW_TICK_SECRET` (timingSafeEqual, require-secret-when-set).

**Review process bắt được (confidence):** G2 stuck-scheduler wedge (cronNext throw → starve all + halt) · A0 validate-0start + step-clobber · E flaky vi.mock + nav over-reach + dead link. Tất cả đã fix + có test.

## 4. QA — Host setup (BẮT BUỘC trước E2E)
```bash
# 1. Migrate DB (áp 0004 workflow + 0006 scheduler)
npm run db:migrate
# 2. (recurring) Secret cho tick endpoint
#    thêm WORKFLOW_TICK_SECRET=<random 32 byte> vào .env
# 3. (recurring) Windows Task Scheduler: gọi mỗi phút
#    POST http://localhost:3100/api/workflows/tick   (header: x-workflow-tick-secret: <secret>)
#    — recurring CHỈ chạy khi có task này. Không bắt buộc cho test manual.
# 4. Bật connector Demo: UI /connectors → Demo → Connect
```

## 5. QA — Kịch bản E2E (test thủ công)
1. **Manual run (core):** `/workflows` → New from template → "Tóm tắt công việc (demo)" → Run now. Kỳ vọng: run `succeeded`, detail có 2 step (n1 connector `demo_list_tasks` output, n2 agent tóm tắt), realtime badge cập nhật.
2. **Moat template:** instantiate "Digest agent chạy đêm qua" → Run now. Kỳ vọng: agent node gọi internal LAAM tools, output = digest agent 24h (cần có agent_session data + Ollama).
3. **Run-log (#5):** detail page → expand một run → thấy từng step (kind/status/output/error).
4. **Schedule (#4):** detail → thêm cron `*/2 * * * *` → (cần Windows Task poke) → chờ → run scheduled xuất hiện.
5. **Condition/foreach:** dựng workflow có condition (rẽ true/false) + foreach (lặp) trong editor → run → verify nhánh + lặp đúng (xem step-log).
6. **Editor (#2):** `/workflows/[id]/edit` → kéo node, nối cạnh, sửa config, Save → graph hợp lệ lưu được; graph sai (vd condition thiếu nhánh) → báo lỗi, KHÔNG lưu.
7. **Clone:** clone một workflow → bản sao thuộc về user, sửa độc lập.
8. **Bảo mật:** user A không xem/chạy/clone được workflow private của user B (404).
9. **Blast gate:** thử đặt node `trello_create_card` (HIGH) → run → fail-closed (từ chối).

## 6. ⚠️ Cần QA TRỰC QUAN (build mù — chưa verify visual)
Editor canvas (kéo/nối node, modal label true/false, auto-layout), `/workflows` list (layout/badge/realtime), modal template, expand step-log, form schedule. RTL đã test *hành vi* (data wiring, button POST, serialization) — KHÔNG test được visual.

## 7. Known limitations / follow-up (non-blocking)
- `NodeConfigPanel` field-label chưa i18n (low).
- Token-precise budget (chỉ step/foreach cap).
- Cron tz/DST; condition reconverge (DAG); manual BLAST_HIGH (PIN-6).
- Sink ghi ngoài thật (Slack/Drive write connectors) chưa có → moat template read-heavy.
- `package-lock.json` working-tree dirty (Windows pruning Linux optional deps — KHÔNG commit, đã restore để Docker build Linux dùng full lock). `.claude/launch.json` dirty (session khác).
- README/CHANGELOG chưa cập nhật cho feature (file shared đa-session — finalize lúc release).

## 8. Rủi ro vận hành
- Agent node chạy Ollama 8B → *chất lượng nội dung* bất định (trần tin cậy đang đo ở phase Reliability/Eval). Engine có cap + fail-stop.
- Scheduled run unattended: blast gate (LOW-only) + atomic claim (no double-run/no-wedge) + fail-finalize + needs-attention surface. Bad-cron tự disable.
