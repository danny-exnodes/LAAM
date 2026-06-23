# Checkpoint: claude-harness-eval — 2026-06-05

Vai trò: technical consultant → orchestrator (subagent-driven). Phase **Reliability & Eval** (lát 1) cho Agent Harness: brainstorm→spec→plan→implement.

## What was done
- Brainstorm → user chốt **Reliability & Eval trước** (các trục skills/tools/agents/workflow/schedule → phase sau).
- Spec `docs/superpowers/specs/2026-06-05-harness-reliability-eval-design.md` + plan `…/plans/2026-06-05-harness-reliability-eval.md` (14 task) + decision `decisions/harness-reliability-eval.md` + INDEX pointer.
- Implement trên **worktree `feat/harness-eval`** (từ HEAD `fb05f05`) qua subagent-driven (5 cụm + review). Eval harness offline: `npm run eval` → drive `runToolRounds` THẬT + Ollama sống + dispatch **stub** (sự-thật đặt trước) → chấm 6 chiều cốt lõi (+rich-block), k-runs (sampler prod) → scorecard `.serena/qa/eval-<date>.{md,json}`.
- 2 bug **test-fixture trong plan của tôi** bị subagent bắt+sửa (write-intent "hoàn tất" spacing; runner.test fake `tools.length`/shared-counter). IMPL (graders/runner) verbatim + đúng. Config dịch sang **Vitest 4** (maxWorkers:1+isolate:false+passWithNoTests vs poolOptions cũ).
- Review: foundation C1+C2 **APPROVED**; final end-to-end **APPROVED** (0 critical/important).

## Files changed (branch feat/harness-eval, 15 commits 52fb899..aa10760)
- `scripts/eval/`: types, util, 7 graders + index (runGraders), stub-dispatch, runner (DI, call-bù), scenarios/* (10 ca, tên `laam_*` thật), report, ollama (realOllama), union-tools, **suite.eval.ts** + `*.test.ts`. `vitest.eval.config.ts` + package.json script `eval`.
- spec + plan + decision committed trên branch (`aa10760`).

## Current state
- `npm test` = **582 pass** (120 file); `tsc --noEmit` clean; `npx vitest list -c vitest.eval.config.ts` liệt kê đủ **10 scenario** (suite wired).
- ⚠️ **`npm run eval` LIVE CHƯA chạy** — cần Ollama host (agent-ops: việc của USER). Đây là payoff: baseline scorecard + xác nhận hành vi model thật. Kỳ vọng F2 (geo/chart) đỏ ~0% (đúng thiết kế, Rule 12).
- Branch chưa merge — chờ user chọn (merge/PR/keep/discard).

## Next steps
- **USER chạy `npm run eval`** trong worktree → baseline scorecard `.serena/qa/` (set env OLLAMA_URL/DEFAULT_CHAT_MODEL nếu khác default).
- Merge/PR `feat/harness-eval`. Dọn **untracked dupes của 3 doc trong MAIN** (spec/plan/decision — bản nháp pre-worktree) tránh đụng khi merge.
- Plan deltas (Vitest-4 config / runner.test fake) — **code là chân lý**; back-sync plan nếu giữ làm artifact.

## Blockers / Risks
- Agent KHÔNG chạy được live eval (Ollama/host). MAIN working-tree dirty từ session khác (đã KHÔNG đụng).
- 3 minor review (by-design, no-fix): write-intent trùng cột grounding; agent-detail maxRounds=3 ở trần orchestrator; Ollama-down → all-fail scorecard nhưng exit 0.

## ✅ BASELINE (live `npm run eval` — 2026-06-05, k=5, 50 lượt, ~124s)
Scorecard: `.serena/qa/eval-2026-06-05.{md,json}` (worktree, untracked — commit nếu giữ).
Pass-rate: **sel 86% · args 100% · ground 83% · restraint 100% · term 100% · write-intent 0% · rich-block 100%**.
- ✅ **Internal read tools rock-solid**: stuck/tokens/machines/agent-detail 5/5 selection+grounding; agent-detail id-chaining (list→`get_agent` id thật `sess-42`) 5/5 args → "AI mù dữ liệu LAAM" ĐÃ lấp, Rule 13 vững (đo được).
- ✅ **chart-render 5/5** → F2-chart hoạt động (RENDER_GUIDE từ fb05f05).
- ⚠️ **geo-directions 0/5 DÙ tool đã inject** → 8B không chọn geo cho "chỉ đường" kể cả khi có sẵn ⇒ F2-geo cần **prompt/few-shot (skills)**, KHÔNG chỉ đăng ký tool. (Phát hiện then chốt.)
- ⚠️ **write-intent 0/5**: model bịa "đã tạo" khi stub trả pending_write ⇒ **xác nhận SP-2 code-built preview là cần thiết** (không tin model narrate write). ground 83% bị kéo bởi chính ca này — read-grounding thực = 100%.
- Eval harness chạy live OK end-to-end → bản thân công cụ đã được nghiệm thu trên Ollama thật.

## ✅ TRANG /eval (investor tracking) — IMPLEMENTED + pushed PR #2 (2026-06-05)
Spec+plan `docs/superpowers/{specs,plans}/2026-06-05-eval-tracking-page*.md` (8 task) → subagent-driven 2 cụm trên `feat/harness-eval`, **589 test · tsc clean** (HEAD 97a1827).
- PC1 (fe94657→1d99b48): bảng `eval_run`+types · `aggregateDims` (DRY report) · `persistEvalRun` best-effort (suite.eval afterAll + label/gitSha) · `eval-stats.buildEvalDashboard/overallOf` (thuần, TDD).
- PC2 (31e9385→6f05f0c): i18n `eval.ts` vi/en/zh + nav (app-header+bottom-nav) · `TrendChart` recharts · Headline/Latest/RunList · EvalClient + `/eval` page.tsx (server).
### ⚠️ HOST STEPS (USER — bắt buộc để trang có dữ liệu):
1. `npm run db:generate` → commit `drizzle/0004_*.sql` → `npm run db:migrate` (tạo bảng eval_run).
2. `npm run eval` ≥2 lần (EVAL_LABEL khác nhau, vd "baseline"/"step2") → populate rows.
3. Mở `/eval` (đã login) → headline + trend + bảng + danh sách. Soát **bottom-nav mobile 6-tab** (thanh thiết-kế-5 → có thể chật; fix `flex-1` hoặc bỏ 1 tab nếu xấu).
### Merge PR #2: dọn untracked dupes (2 spec + 2 plan + decision + backlog) trong main.
