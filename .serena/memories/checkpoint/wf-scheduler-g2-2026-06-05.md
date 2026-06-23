# Checkpoint: wf-scheduler (G2 Scheduler, Phase B) — 2026-06-05

## What was done
G2: Workflow Scheduler on `feat/wf-scheduler` (worktree). All 6 plan tasks, TDD, one commit per task (T6 = doc+plan).
- **T1 schema** (`34d079c`): `workflow_schedule` table (cron/timezone/enabled/catchupPolicy/nextRunAt/lastRunAt/missedCount); `workflow_run` +`scheduleId`(FK→schedule, set-null, nullable) +`scheduledFor` + UNIQUE`(scheduleId,scheduledFor)`. Migration `0006_gigantic_blizzard.sql` (offline generate). `WorkflowSchedule` type.
- **T2 cron** (`5fff6f5`): `cron.ts` hand-rolled 5-field (parseCron/matchesCron/nextRunAt), pure, NO dep. `*`/int/`*/n`/`a-b`/`a,b`. Server-local TZ (tz/DST deferred). dom+dow both restricted = OR (Vixie). 30 tests.
- **T3 blast** (`546f47e`): `policy.ts` +`BLAST_LOW={demo_create_task}`+`resolveBlast`; `blast.ts` `assertConnectorAllowed` (WRITE && high → throw); `runtime.ts` extracted shared `buildRunNode` with gate wired into connector path (manual+scheduled). 6+3+4 tests.
- **T4 core** (`dbb2902`): `run.ts` extract `executeRunRow` (engine on existing row; returns {status,steps}); `executeRun` unchanged contract. `schedule.ts` `tickClaim` (atomic claim+advance ONE tx, PIN-D1) + `tickExecute`. 9+2 tests.
- **T5 routes** (`ce2ebdb`): `tick-auth.ts` `isTickAuthorized` (localhost OR secret, hardened vs proxy spoof); `POST /api/workflows/tick` (non-session, in isPublic); `schedules` (POST create+GET); `runs` + `runs/[id]` (ownership). `.env.example` +WORKFLOW_TICK_SECRET. 7 tests.
- **T6 doc** (`6d67415`): CHANGELOG entry + Windows Task poke runbook (NOT installed) + plan tracked.

## Files changed
- schema.ts, drizzle/0006_*.sql (+meta), auth.config.ts, .env.example, CHANGELOG.md
- src/lib/workflow/: cron.ts, blast.ts, runtime.ts, schedule.ts, tick-auth.ts (+ .test), run.ts (refactor)
- src/lib/agent/safety/policy.ts (+resolveBlast/BLAST_LOW)
- src/app/api/workflows/: tick/route.ts, schedules/route.ts, runs/route.ts, runs/[id]/route.ts; [id]/run/route.ts (use shared buildRunNode)

## Current state
- WORKING. `tsc --noEmit` = 0. `vitest run src/lib/workflow` = **129 green** (12 files). Full suite = **739 green** (138 files), zero regressions (was 679 on branch base).
- A0/G1 contracts intact: runNode/executeRun signatures preserved; manual run path byte-compatible.
- package.json/package-lock UNTOUCHED (no new deps). No eval/new Function. No services started.

## Next steps (host — USER runs; agent-ops)
- `npm run db:migrate` (applies 0006). NOTE cross-session: main's `eval_run` migration is 0005; 0006 = G2 — both apply cleanly in sequence.
- Optionally register the Windows Task poke (runbook in CHANGELOG). Set WORKFLOW_TICK_SECRET if non-local.
- E2E: create workflow → POST /api/workflows/schedules → poke /api/workflows/tick → verify queued run executes, nextRunAt advances, dedupe on re-poke.
- Then G3 templates · G4 editor · G5 mgmt page.

## Blockers / Risks
- None blocking. Design notes (documented, non-blocking):
  - Under CONCURRENT pokes for the same schedule, `nextRunAt` advance is idempotent (derived from shared `now`) but `missedCount` may slightly over-count (observational only, not control-flow). Normal single-poke operation = exact. No CAS guard added (Rule 2; PIN-D1 stuck-window + slot-dedupe already cover correctness).
  - Cron TZ = server-local v1; tz/DST deferred per spec.
  - `countDueSlots` capped at 10k (missedCount saturates) so a long-disabled schedule can't stall a tick.
  - Tick localhost branch trusts Host header only when NOT proxied (no x-forwarded-*); secret is the strong path. Prod should set WORKFLOW_TICK_SECRET.
