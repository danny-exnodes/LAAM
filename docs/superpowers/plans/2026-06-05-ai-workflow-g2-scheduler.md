# AI Workflow — G2 Scheduler (Phase B) Plan

> Execute via subagent-driven, TDD. Backend only. Branch `feat/wf-scheduler` (base = local HEAD with A0+G1).

**Goal:** Recurring/scheduled execution: `workflow_schedule` table + **atomic DB-claim** (PIN-D1) + `/api/workflows/tick` (claim→execute) + missed-schedule (skip-realign) + **blast-radius gate** (v1 LOW-only) + observability endpoints (runs list/detail for E). No UI. No OS-task install (documented host step).

**Design decisions (autonomous, for review):**
- **Atomic claim:** `tickClaim` does, per due schedule, in ONE `db.transaction`: INSERT `workflow_run{scheduleId, scheduledFor, status:'queued', graphSnapshot}` `ON CONFLICT(scheduleId,scheduledFor) DO NOTHING` + advance `nextRunAt` + `lastRunAt` + `missedCount`. `tickExecute` is SEPARATE (picks `status='queued'`, runs engine, finalizes). Closes the "claim-then-die-before-advance" stuck-forever window.
- **`scheduledFor`** = stored `nextRunAt` floored to the minute → racing pokes compute the same slot → UNIQUE dedupe.
- **Missed:** fire at most ONE run per due schedule per tick (`scheduledFor=nextRunAt`); advance `nextRunAt` to the next slot strictly after `now` (skip-realign, NO burst); `missedCount += skippedSlots`. `catchupPolicy` stored, v1 behavior = always fire-one (no backfill); documented.
- **Cron** hand-rolled 5-field (min hour dom month dow): `*`, int, `*/n`, `a-b`, `a,b`. `nextRunAt` iterates minute-by-minute (cap 366d) until match. TZ = server-local for v1 (full tz/DST deferred — documented).
- **Blast gate:** extend `safety/policy.ts`: `BLAST_LOW` allowlist = `{demo_create_task}`; any connector action classified `write` (via `resolveKind`) NOT in the LOW allowlist → `BLAST_HIGH`. Run layer: a connector node whose action is a HIGH write → **fail-closed throw** (both manual + scheduled, per spec F1 v1-LOW-only). Reads + LOW writes pass.
- **A0/G1 contracts preserved.** Migration generated offline (`drizzle-kit generate` → 0006).

---

## File Structure
| File | Change |
|---|---|
| `src/db/schema.ts` | +`workflowSchedules` table; ALTER `workflowRuns`: +`scheduleId`(→schedule, set null), +`scheduledFor`, + `unique(scheduleId, scheduledFor)` |
| `drizzle/0006_*.sql` | generated migration |
| `src/lib/workflow/cron.ts` (new) | `nextRunAt(cron, from)`, `matchesCron(cron, date)`, `parseCron` |
| `src/lib/agent/safety/policy.ts` | +`BLAST_LOW` set + `resolveBlast(name): 'low'|'high'` |
| `src/lib/workflow/blast.ts` (new) OR in run.ts | `assertBlastAllowed(action)` gate helper |
| `src/lib/workflow/run.ts` | extract `executeRunRow(db, runRow, deps)` (run engine on existing row); `executeRun` = create row + executeRunRow; connector blast gate in buildRunNode |
| `src/lib/workflow/schedule.ts` (new) | `tickClaim(db, now)`, `tickExecute(db, buildRunNode, publish)` |
| `src/app/api/workflows/tick/route.ts` (new) | POST (localhost/secret auth) → tickClaim + tickExecute |
| `src/app/api/workflows/schedules/route.ts` (new) | POST create schedule, GET list (user) |
| `src/app/api/workflows/runs/route.ts` (new) | GET list runs (user, ?workflowId, ?status) — observability for E |
| `src/app/api/workflows/runs/[id]/route.ts` (new) | GET run + steps detail |

---

## Task 1: Schema — workflow_schedule + workflow_run alters + migration
- `workflowSchedules` ("workflow_schedule"): id, workflowId→workflows(cascade,notNull), userId→users(cascade,notNull), cron(notNull), timezone(default 'Asia/Ho_Chi_Minh'), enabled(bool default true), catchupPolicy(text default 'skip'), nextRunAt(timestamp), lastRunAt(timestamp), missedCount(int default 0), createdAt, updatedAt.
- ALTER `workflowRuns`: add `scheduleId` text references workflowSchedules.id {onDelete:'set null'} (nullable); add `scheduledFor` timestamp {mode:date} (nullable). Add `unique("workflow_run_schedule_slot").on(scheduleId, scheduledFor)`.
- Type exports: `WorkflowSchedule`.
- `npx tsc --noEmit` → 0. Then `npx drizzle-kit generate` (offline) → commit the new `0006_*.sql` + meta. Commit schema + migration.

## Task 2: cron.ts + tests
- `parseCron(s): {min,hour,dom,month,dow}` (each = matcher fn over a number); throw on invalid.
- `matchesCron(cron, date): boolean`; `nextRunAt(cron, from: Date): Date` (smallest minute-boundary `> from` that matches; iterate, cap ~527040 min/366d, throw if none).
- Tests: `*/5 * * * *` next from 12:02 → 12:05; `0 8 * * *` → next 08:00; `0 0 1 * *` → 1st of month; list `0 8,20 * * *`; range `0 9-17 * * *`; invalid throws.

## Task 3: Blast-radius gate
- `policy.ts`: `export const BLAST_LOW = new Set(["demo_create_task"]);` + `export function resolveBlast(name): "low"|"high" { return BLAST_LOW.has(name) ? "low" : "high"; }`.
- Gate helper `assertConnectorAllowed(action)`: if `resolveKind(action, INTERNAL_TOOLS) === "write"` AND `resolveBlast(action) === "high"` → `throw new Error("blast: '"+action+"' là write blast-radius cao — không cho phép trong workflow v1")`. (reads + LOW writes pass.)
- Wire into `buildRunNode` connector path (before `connectorExecute`). Both manual + scheduled.
- Tests: demo_list_tasks (read) passes; demo_create_task (LOW write) passes; trello_create_card (HIGH write) throws.

## Task 4: schedule.ts (tickClaim + tickExecute) + run.ts refactor
- Refactor `run.ts`: extract `executeRunRow(db, run, deps)` = engine-run + step-persist + finalize on an EXISTING `workflow_run` row (status→running→succeeded/failed). `executeRun(input, deps)` (manual) = load wf + insert run row + `executeRunRow`.
- `tickClaim(db, now): Promise<string[]>` (claimed run ids): select schedules WHERE enabled AND nextRunAt<=now. For each, `db.transaction`: load workflow (for graph snapshot); `scheduledFor=floorMinute(nextRunAt)`; INSERT workflow_run{id, workflowId, userId, trigger:'schedule', status:'queued', graphSnapshot, scheduleId, scheduledFor} `.onConflictDoNothing({target:[scheduleId,scheduledFor]})`; compute `next=nextRunAt(cron, now)`, `skipped=count slots between nextRunAt and now`; UPDATE schedule SET nextRunAt=next, lastRunAt=now, missedCount=missedCount+max(0,skipped-1). Return inserted run ids.
- `tickExecute(db, deps): Promise<void>`: select workflow_run WHERE status='queued' (limit N); for each, `executeRunRow`.
- Tests (mock db + transaction): claim inserts queued run + advances nextRunAt in one tx; conflict (same slot) → no double; tickExecute runs queued → succeeded; the stuck-window: simulate insert-ok but show advance is in the SAME tx (assert both happen together via the mock recording tx ops).

## Task 5: Routes
- `POST /api/workflows/tick`: auth = localhost OR secret header (`x-workflow-tick-secret` === env `WORKFLOW_TICK_SECRET`); NOT session. Calls `tickClaim(db, now)` then `tickExecute(db, deps)`. Returns `{claimed, executed}`. (now = `new Date()` — server time.)
- `POST /api/workflows/schedules` (session): create schedule for a workflow the user owns ({workflowId, cron, timezone?, catchupPolicy?}); validate cron (parseCron); set nextRunAt=nextRunAt(cron, now). `GET` list user's schedules.
- `GET /api/workflows/runs` (session): list user's runs (?workflowId, ?status) ordered desc; `GET /api/workflows/runs/[id]`: run + its steps (verify ownership).

## Task 6: Verify + integrate + doc
- tsc 0 + `npx vitest run src/lib/workflow` all green (+ A0/G1).
- `npx drizzle-kit generate` if schema changed after T1 (should be one migration 0006).
- Add a short setup doc block (in the plan or README note) for the Windows Task Scheduler poke: a scheduled task running every minute calling `POST http://localhost:3100/api/workflows/tick` with the secret header. **Do NOT install it.**

## Self-review
A0/G1 intact? claim+advance same tx (no stuck window)? scheduledFor floored? blast HIGH fail-closed? tick endpoint localhost/secret only (not exposed)? observability endpoints ownership-checked? tsc 0 + suite green?
