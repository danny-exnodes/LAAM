# Checkpoint: claude (consultant, eval-v2) — 2026-06-06

## What was done
- Implement **Eval v2 — E1 coverage + selection-at-scale** theo plan CTO-gated (`docs/superpowers/plans/2026-06-06-eval-v2-e1-selection-scale.md`), TDD, trong worktree `worktree-eval-v2`.
- **E1:** grader `citesRealUrl` (Rule 13 cho URL → dim grounding) + 6 scenario world-tools (web research-loop/restraint, util_calc, laam search_sessions/get_timeline/query_audit). Structural test → 16 ca.
- **selection-at-scale:** `scale/distractors.ts` (allConnectorSchemas + padToN) + `scale/curve.ts` (Wilson CI + no-call line) + `suite.scale.eval.ts` (4 probe × 8/16/24/40 tool, pool=prod union internal+connector).
- **2 CTO nit ÁP:** (1) `noCall` tách no-call vs wrong-call (runner+ScenarioScore+curve); (2) trello correct-schema lấy thật từ registry.

## Files changed (branch `worktree-eval-v2`)
- MỚI: `scripts/eval/graders/cites-real-url.{ts,test.ts}` · `scripts/eval/scenarios/{web,util,laam-extra}.ts` · `scripts/eval/scale/{distractors,curve}.{ts,test.ts}` · `scripts/eval/suite.scale.eval.ts`.
- SỬA: `scripts/eval/types.ts` (citesRealUrl + noCall) · `graders/index.ts` · `runner.ts` (noCall) · `scenarios/index.ts`+`index.test.ts` (16) · `package.json` (eval scoped + eval:scale).
- 4 commit: grader+noCall · E1 scenarios · distractors+curve · scale suite+scripts.

## Current state
- ✅ **1072 test xanh** (`npm test`), `tsc --noEmit` sạch. **0 dep mới, 0 sửa `src/lib`** (chỉ IMPORT CONNECTORS/INTERNAL_TOOLS), measure-only. Live `*.eval.ts` KHÔNG bị `npm test` đụng (default include = *.test.ts).
- ⛔ CHƯA chạy live (agent-ops: `npm run eval` + `npm run eval:scale` = **host/user**, cần Ollama). CHƯA merge.

## Next steps
- **Host chạy:** `npm run eval` (scorecard 16-scenario) + `npm run eval:scale` (curve `qa/eval-scale-<date>.md`) → đưa consultant.
- Consultant diễn giải đường cong → nếu **write-probe crater ở ~24–40** (CTO trigger: <60% / tụt >15đ vs read, Wilson) ⇒ mở slice **tool-subsetting** RIÊNG (gate connector-GA).
- Merge `worktree-eval-v2` → main.

## Blockers / Risks
- Live eval host-only (Ollama). Curve cần host chạy mới có số.
- Caveat CTO: E0 đổi 2 biến → scale là giả thuyết; curve (probe cố định + pad) mới isolate biến count.
