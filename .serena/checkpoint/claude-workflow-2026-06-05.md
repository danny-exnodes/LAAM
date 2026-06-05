# Checkpoint: claude-workflow (technical consultant) — 2026-06-05

## What was done
- Brainstorming **có phản biện** (3 vòng review user) cho feature MỚI **AI Workflow Orchestration** (chạy song song Harness roadmap).
- Boot Protocol đầy đủ (INDEX → harness memories → checkpoint `claude-harness-06-05` → `schema.ts` → `orchestrator/types/policy`).
- Chốt 8 nhóm quyết định (D-RUNTIME/ENTITY/TOPOLOGY/STATE + #3 safety + blast-radius + scheduler + snapshot + phasing). **User đã KÝ.**
- Viết spec đầy đủ + decision memo + cập nhật INDEX.

## Files changed (KHÔNG đụng code, KHÔNG chạy service)
- `docs/superpowers/specs/2026-06-05-ai-workflow-orchestration-design.md` (MỚI — spec đầy đủ, 5 PIN dạng chữ).
- `.serena/memories/decisions/workflow-orchestration-architecture.md` (MỚI — pointer + chốt).
- `.serena/memories/INDEX.md` (+1 pointer Decisions).
- `.serena/checkpoint/claude-workflow-2026-06-05.md` (file này).

## Current state
- Spec **signed**, đang chờ **user đọc một lượt** trước khi A0 chạm code (user yêu cầu rõ: D1/D3 phải ở dạng chữ trong spec — đã có, đánh dấu PIN).
- Verify factual: `runToolRounds` phẳng `maxRounds=4` **KHÔNG** sub-agent. **Pushback của reviewer chứa 1 claim sai (sub-agent fan-out); consultant verify `orchestrator.ts` & sửa**; bounding reframe theo `foreach`×inference.

## Next steps
- User đọc spec → OK → `superpowers:writing-plans` tạo plan **A0**.
- A0 = slice mỏng (manual + 1 agent + 1 connector + run_step + SSE). **PIN-D3a (connector args non-string) cắn ngay A0.**

## Blockers / Risks
- Phase B đụng luật **no-background-services** (Windows Task poke) → phải xin phép user trước khi cài.
- **PIN-D1** (atomic claim cửa-tử) + **PIN-D3** (type nội suy) = loại đúng-sơ-đồ-sai-code; phải có test đúng.
- 5 PIN mới ở spec, **chưa vào plan/code**.

## Update — CTO audit post-sign-off (vá F1–F4, 2026-06-05)
- CTO audit spec sau ký (comms `cto-to-consultant-workflow-spec-audit`). Verify code thật (`gate.ts`/`resume.ts`/`preview.ts`) — **CTO đúng cả 4**.
- **F1 🔴 → (a):** bỏ claim tái-dùng-`gate.ts`; v1 workflow = `BLAST_LOW`-only (scheduled+manual); manual-`BLAST_HIGH` → §10 (PIN-6 suspend-continue + ngoại lệ D4b). Chặn *plan Phase B*, KHÔNG chặn A0.
- **F2 🟡:** sửa lý do no-resume (harness ĐÃ có nonce `resume.ts:56-58`; v1 hoãn resume-cấp-run cần idempotency per-node).
- **F3 🟡:** thống nhất memo+checkpoint (reviewer pushback có claim sai, consultant sửa — không đổ lỗi consultant/user).
- **F4 🟡:** +§6.4 owner-lifecycle. **Finding:** `users` chưa có cột `active`/`disabled` → cred-missing enforce ngay, user-deactivate cần flag.
- Vá: spec (§3.4/§5.4/§6.4/§7/§10/§11) + memo + checkpoint này. **KHÔNG đụng code.** Đã append phản hồi vào comms file → chờ CTO review → `resolved/`.

## Update — Plan A0 viết xong + HOLD cho CTO (2026-06-05)
- `writing-plans` → `docs/superpowers/plans/2026-06-05-ai-workflow-a0.md` (8 task TDD: types→schema→interpolate→validate→executors→engine→run/routes→E2E host). Đọc thật `route.ts`/`connectors/index`/`events-bus`/`registry`/`orchestrator.test` để code đầy đủ, không placeholder. Verify quirk: `runToolRounds` break KHÔNG trả text cuối → agent executor gọi `callOllama(convo,[])` lần cuối.
- DI khắp nơi → Task 1–7 build+test KHÔNG cần host; chỉ migrate (Task 2.4) + E2E (Task 8) là host (agent-ops).
- **Item MỚI surface cho CTO (không thuộc F1–F4):** **PIN-D3a-sink** — object embedded: sink text=stringify (agent prompt), sink arg=fail (connector arg); sole-token giữ type. Đã append vào comms.
- **User chọn HOLD cho CTO** → A0 chưa execute. Chờ CTO ký F1–F4 + chốt PIN-D3a-sink.

## Update — CTO CLEAR cả 2 gate + refinement land (2026-06-05)
- CTO ký F1–F4 (verify file thật) + duyệt PIN-D3a-sink **với 1 refinement bắt buộc**: `resolveTemplate(text)` = **total→string** (kể cả sole-token; stringify MỘT chỗ trong interpolate), KHÔNG giữ-type ở text sink; `arg` sink sole-token giữ type. (A2) condition = arg-sink.
- Verify refinement đúng (single-responsibility stringify) rồi áp: spec §5.2 reword + plan Task 3 (interpolate sink-split + header/doc-comment + 2 test mới text-sink) + Task 5 (`runAgentNode` dùng string thẳng) + nit §3.4 (gate land Phase B).
- Comms thread → `comms/resolved/cto-to-consultant-workflow-spec-audit.md`.

## Next — HẾT HOLD
- Chờ user chọn execution mode (subagent-driven khuyến nghị) → isolate worktree → chạy plan A0 task-by-task. Task 1–7 không cần host; Task 2.4 (migrate) + Task 8 (E2E) là host (user).

## ✅ A0 IMPLEMENTED + MERGED (2026-06-05)
- Subagent-driven trong worktree `worktree-workflow-a0`: 7 task × (implementer sonnet + review; Task 7 review opus). **2 bug caught+fixed** (validate 0-start→cycle; run.ts step-persist `where(runId)` clobber → `stepRowId` map). Final review READY.
- **GAP-1 đóng:** `drizzle-kit generate` chạy OFFLINE OK trong worktree (note cũ 'no sandbox' chỉ đúng cho `migrate`) → committed `0004_cultured_goliath` → branch self-contained.
- **Merged vào main (Option 1):** merge `c1184de` (resolve `schema.ts`: giữ cả `eval_run` của PR#2 + 3 bảng workflow) + docs `6ccbd55`. Worktree+branch dọn sạch. **Full suite 1220 pass, tsc 0.**
- ⚠️ **Cross-session observation:** main có `eval_run` trong schema NHƯNG migration dừng ở 0003 (0004 = workflow) → **eval_run CHƯA có migration trên main**; host `db:migrate` tạo bảng workflow, KHÔNG tạo eval_run. Eval session cần generate (sẽ là 0005). Flag cho user.
- **Non-blocking follow-up (A1):** (1) SSE phát event generic — chưa typed `workflow_run_step` cho UI; (2) `onStep('running')` ngoài try (run kẹt 'running' nếu insert lỗi); (3) `run_step.input` chưa populate.

## Next = Task 8 E2E host (USER chạy — agent-ops)
`npm run db:migrate` (áp 0004) → /connectors bật Demo → POST /api/workflows (seed graph 1 connector→1 agent, xem plan Task 8) → POST /api/workflows/[id]/run → verify: run.status=succeeded · 2 step (n1 output, n2 tóm tắt) · SSE.

---
# AUTONOMOUS RUN A1→E (user giao toàn quyền 2026-06-05) — operating: worktree/group từ local HEAD, merge local main/group, KHÔNG push, KHÔNG dev/preview/OS-task, subagent-driven.

## ✅ G1 ENGINE v2 — DONE + MERGED (`60a5a2a`)
- Worktree `feat/wf-engine` (local HEAD). 1 opus implementer (6 task TDD) + 1 opus adversarial review (7 invariant + 8 probe → APPROVED). Merge clean. **tsc 0 · 73 workflow test · 679 full repo (0 regression).**
- Thêm: `condition` (predicate + cạnh label true/false), `foreach` (body lồng, item/index trong vars, parentStepId child), budget (maxSteps+maxForeachItems cap), `predicate.ts` (comparator+all/any, arg-sink, exists/not_exists tolerate-missing), validate v2 (`assertRunnable`), run.ts (input populated, finalize-on-throw). **A0 contracts frozen + intact.**
- Decisions (documented): condition no-reconverge (tree); token-precise budget hoãn (step/item cap đủ chặn runaway).

## ✅ G2 SCHEDULER (B) — DONE + MERGED (`6f4e760`)
- opus impl (6 task TDD) + opus adversarial review (bắt 1 BLOCKING: `tickClaim` `cronNext`-throw → wedge + sibling-starvation) → opus fix (try/catch auto-disable, no starvation, có test chứng minh) → merge clean. **tsc 0 · 136 workflow · 746 full repo.**
- Added: `workflow_schedule` + `workflow_run.scheduleId/scheduledFor` + unique slot (migration **0006**); `cron.ts` (hand-rolled 5-field, NO dep); `schedule.ts` (`tickClaim` atomic same-tx PIN-D1 + `tickExecute` tách); `runtime.ts` (shared `buildRunNode` + blast gate: LOW=`demo_create_task`, HIGH-write→fail-closed manual+scheduled); `tick-auth` (localhost/secret timingSafeEqual, require-secret-when-set); routes `tick`/`schedules`/`runs`.
- ⚠️ **Host steps (user):** `db:migrate` (0006), set `WORKFLOW_TICK_SECRET`, cài Windows Task poke (→ `POST /api/workflows/tick`). KHÔNG do tôi.
- Decisions: cron tz=server-local (DST deferred); missedCount observational (harmless); bad-cron schedule auto-disable + surface.

## ▶ Next: G3 TEMPLATES (C)
Static template catalog (`src/lib/workflow/templates.ts`, ≥2 moat-leaning đọc LAAM agent_sessions/stats qua SP-1 internal tools) + instantiate/clone (deep-copy graph → user workflow, credential-free) + list endpoint. Rồi G4 editor (React Flow) · G5 mgmt page. (G4/G5 = UI: build + RTL + tsc, KHÔNG live-verify.)

## ✅ G3 TEMPLATES (C) — DONE + MERGED (`832029f`)
- sonnet impl + sonnet review (templates valid, clone/instantiate ownership-safe, no cross-user hole). **tsc 0 · 156 workflow+route · 766 full repo.**
- `templates.ts` catalog (3: `digest-overnight-agents`+`flag-stuck-agents` = moat qua SP-1 tools; `summarize-demo-tasks` demo) + `GET /api/workflows/templates` + `POST .../templates/[id]/instantiate` + `POST /api/workflows/[id]/clone` (credential-free, ownership-checked). No schema/dep.

## ▶ Next: UI (reorder E trước D — risk/value: E=goal-page + lower blind-risk; D editor=highest blind-risk → last)
⚠️ **UI build BLIND** (no dev/preview per agent-ops) → component + RTL + tsc + i18n vi/en/zh; **LIVE QA = user review.**
- **E mgmt page** `/workflows`: list + detail (runs/steps = log #5 + schedule #4) + SSE realtime (#7, forward workflow_* events qua /api/events) + needs-attention.
- **D editor** `/workflows/[id]/edit`: React Flow (reuse @xyflow/react from /graph) + node palette (agent/connector/condition/foreach) + config forms + save/validate.

## ✅ E MGMT PAGE — DONE + MERGED (`9c454b8`)
- sonnet impl + sonnet review (**SSE no-regression CONFIRMED** additive, auth-gated, i18n complete) → 2 issues found (dead `/workflows/new` link; bottom-nav over-reach dropping eval/settings) → sonnet fix (removed link; bottom-nav reverted — `diff main` empty; workflows = desktop-nav only) → consultant fixed flaky test (duplicate `vi.mock("@/db")` in instantiate test, order-dependent fail). Merge clean. **tsc 0 · 788 branch / 1377 full green.**
- `/workflows` list + `/workflows/[id]` detail (runs→steps = log #5; schedule form #4; run-now); `useWorkflowEvents` + `/api/events` forwards `workflow_*` (realtime #7, sessions intact); needs-attention; i18n vi/en/zh; desktop nav link.
- ⚠️ **UI BLIND — needs user live QA.** Concern: no `GET /api/workflows/[id]` (detail fetches list+filter).

## ▶ Next: D EDITOR (last phase)
`/workflows/[id]/edit` React Flow (reuse @xyflow/react from `/graph`) + palette (agent/connector/condition/foreach) + config forms + edge-draw (condition true/false labels) + save (**add PATCH /api/workflows/[id]** + assertRunnable validate) + blank-create flow. Highest blind-risk → graph↔WorkflowGraph serialization PURE+tested; canvas interactions flagged for QA.

## ✅ D EDITOR — DONE + MERGED (`851c13f`)
- sonnet impl (5 task) + sonnet review (round-trip TRUE-inverse all 4 kinds+labels+foreach-body; GET/PATCH owner+server-validate; save client+server; blank-create fixes dead link) APPROVED. **tsc 0 · 847 branch / 1436 full green.**
- `GET+PATCH /api/workflows/[id]`; `graph-serde.ts` (pure round-trip, 19 tests); `NodeConfigPanel`; `WorkflowEditor` (React Flow canvas + palette + connect + save); `/workflows/new` (blank); i18n. ⚠️ canvas drag/connect + visual = LIVE QA. Minor: NodeConfigPanel field labels chưa i18n (low, follow-up).

## 🏁 AUTONOMOUS RUN COMPLETE (A1→E) — ALL ON LOCAL MAIN `851c13f`, **NOT pushed**
- A0(prior) · G1 engine v2 · G2 scheduler · G3 templates · E mgmt · D editor. tsc 0, full suite green. Migrations 0004(wf)+0006(scheduler) [+0005 eval]. Review-then-push (user+CTO).
- **HOST STEPS (user):** `db:migrate` (0006) · set `WORKFLOW_TICK_SECRET` · install Windows Task poke (→/api/workflows/tick) · **live UI QA** (editor canvas + mgmt page) · Task 8 E2E.
- Follow-ups (non-blocking): NodeConfigPanel i18n · token-precise budget (deferred, step/foreach caps suffice) · cron tz/DST · condition reconverge/DAG · manual BLAST_HIGH (PIN-6 suspend-continue) · `package-lock.json` dirty (not mine — left).
