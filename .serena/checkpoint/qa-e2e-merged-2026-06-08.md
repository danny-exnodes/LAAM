# Checkpoint: qa-e2e-merged-batch (QA/QC lead) — 2026-06-08

## What was done
- Live E2E on merged batch (HEAD `00aba41`, tested on `75bea85`) per CTO request
  `comms/active/cto-to-qa-e2e-merged-2026-06-08`. **verify-not-prose**: DB introspection
  (psql), DOM audits (`getComputedStyle` + in-page WCAG calc), real logged-in Chrome (:8443),
  eval host run. Covered all 6 areas.
- **User decisions this session:** P0a behavioral crash-resume **SKIPPED** (no app kill/restart);
  eval **RUN** (base + scale); UI via existing logged-in Chrome.

## Results — PASS
- **P0a** (schema/precondition/WAL): `workflow_node_idempotency` UNIQUE(runId,nodeId,iterIndex) ✅;
  **0 `running` runs** (precondition safe) ✅; real WAL `claimed` marker on a connector node of a
  `failed` run (claim-before-send works) ✅. *Behavioral resume deferred (user skip).*
- **Write-guard (PR#3)** ✅✅ **both paths**: Confirm→exec→narration **"ID: T-103"** (real tool result)
  + `audit_log` **4→5** (+1); Cancel→**"Đã huỷ hành động"** (no false claim) + audit **NOT** incremented.
  Audit side-effect corroborates behavior exactly.
- **Workflow editor regression**: F1 (2 handles src+tgt, connectable, drew edge n1→connector) ✅;
  U3 node on-screen ✅; F3 no orphan draft on GET /new ✅; F2 delete (inline confirm, count 13→12) ✅;
  save round-trip ✅.
- **Connectors**: 7 connected (Demo/GitHub/Trello/Jira/Google×3 OAuth) render ✅. OCR proactive (F3) ✅.
- **Eval (P2)**: measure-only (16+16 = "ran k", not pass). Scorecard reliability **97%**; see below.

## Results — ⚠️ findings / caveats
- **Access spine (PR#6)**: schema PASS (access_token UNIQUE(tokenHash)+prefix/last4/userId+scopes;
  agent_session.userId; mig 0009). **BUT behaviorally UNEXERCISED** — 0 access_token, 0 machine.tokenHash
  legacy, 0 session.userId → cannot verify new-collector→userId / legacy-fallback / lastUsedAt-bump.
- **Matte Dark (PR#5)**: dark+light render OK, accent #36a6d6, connector-node cyan — but **3 findings**
  → `backlog/matte-dark-qa-ui-bugs`: A1🟠 light accent contrast **2.77:1** (fail AA + 3:1 floor; all CTAs/links);
  A2🟠 `backdrop-blur(12px)` leftover on header + mobile-nav (every page); A3🟠 /eval recharts series
  `#111827` invisible on dark + Y-axis "100%"→"00%". A4🟢 doc-drift WCAG claims.

## Strategic signal (DECISION GATE) → backlog/harness-write-tool-subsetting
- **Write-tool selection craters at scale: 100%@8 → 0%@16/24/40** (Wilson [0–43%], total no-call@16).
  Base write-intent 40% (model confabulates "đã tạo" pre-confirm 3/5). Other dims 95–100%.
- Runtime `write-claim-guard` mitigates the confab (verified live) — but full-union tool exposure kills
  write SELECTION. ⇒ subset tools (≤~8) before connector-write GA. Artifacts: `.serena/qa/eval-2026-06-08.md`,
  `eval-scale-2026-06-08.md`.

## Test data
- Created+saved+**deleted** test workflow `8cc50b96` (cleanup verified F2; DB count back to 12; P0a
  claimed-row wf untouched). Demo task `T-103` (offline/ephemeral). 2 chat convos left as evidence.
- Removed temp `qa-eval-run.log` from repo root.

## Next steps (deferred)
- P0a behavioral crash-resume (kill+restart auth). Access-spine behavior (mint token→ingest→userId;
  legacy fallback). Matte Dark: agents/[id]/graph/monitoring/register + focus-ring + prefers-reduced-motion.
  world-tools chat (web_search→web_read follow-up gap from eval; chart/map render). Scheduler fire.

## Blockers
- None for what was tested. Deferred items need destructive perm (P0a) or live data exercise (Access).
