# Wave 0 — Package B: `/api/stats` + `lib/stats.ts` (TDD sub-plan)

Owner: agent `stats`. Parent plan: `2026-06-03-v2-wave0-foundation.md`.

## Goal
Port v1 `lib/stats.js` aggregation into a typed `computeStats(sessions: SessionRow[]): Stats`
that emits the **LOCKED** `Stats` shape, plus an auth-guarded `GET /api/stats` that selects
agentSessions rows via Drizzle and returns `computeStats`.

## Conflict resolved (AGENTS.md Rule 7)
The locked `Stats` interface differs from v1's return shape (v1 used arrays-of-objects for
byModel/byBranch, an object {cells,max} for heatmap, {bucketMs,points} for activity, and a
{mostUsed,mostErrors,slowest} toolLeaderboard). **The locked interface wins** — it is the
contract Waves 1–4 consume. I port the v1 *aggregation logic* but emit the *locked shape*.

## Field mapping (SessionRow = agentSessions row)
- tokensIn / tokensOut → direct columns (v1 used `s.tokens.input/output`).
- toolCalls per session → `toolCount` column (v1 `s.toolUseCount`).
- subAgents → `subAgentCount` column.
- costUsd → direct column (v1 fell back to pricing; v2 stores it, so trust the column).
- durationMs → DERIVED = `lastActivity - startedAt` (v1 semantics, parser.js:249). null/≤0 ignored.
- per-tool `{name,count,errors,avgDurationMs}` → `tools` jsonb (NO totalDurationMs/timed in v2;
  avgDurationMs already aggregated per session → average across sessions weighted by count when
  present, else null).
- heatmap → `histo` jsonb keyed "<dow>_<hour>".
- byProject "project" label → join to project name; route resolves, computeStats receives a
  `project` string already on each row (added by the route's select/join). The pure fn keys on
  whatever string it is given (Rule 13).
- topBy*.label → `"<project> · <model>"` derived in fn.

## Steps (TDD — RED then GREEN)
- [ ] 1. `stats.types.ts`: `SessionRow` (subset of agentSessions used) + `Stats` (locked).
- [ ] 2. `stats.test.ts` RED: fixture of SessionRows asserting every Stats field:
      totals (sessions/running/idle/done, messages, toolCalls, subAgents, tokensIn/out, costUsd,
      avgDurationMs), byStatus/byModel/byBranch records, byProject agg, toolLeaderboard
      (count/errors/errorRate/avgDurationMs), modelComparison (tokensPerMin/doneRate),
      heatmap 7×24 shape+buckets, activity buckets, topByDuration/topByTokens ordering.
- [ ] 3. **Rule 13 guard test**: two rows whose `tools` carry the SAME tool in DIFFERENT casing
      ("Bash" vs "bash") — assert leaderboard keeps BOTH exact stored keys (no normalization /
      case-fold). The fixture is the "altered-casing" input the model could have produced.
- [ ] 4. `stats.ts`: implement `computeStats` to pass.
- [ ] 5. `app/api/stats/route.ts`: `auth()` guard → 401; select rows (+project name) via Drizzle;
      map Date→ms; call computeStats; return JSON.
- [ ] 6. `app/api/stats/route.test.ts` smoke: mock `@/auth` (unauth→401) and `@/db` (authed→200
      with stats payload); assert no DB hit when unauthorized.

## Success criteria
`cd v2 && npx vitest run src/lib/stats` green (logic + route smoke). Conforms to locked `Stats`.
No edits outside scope files. Left uncommitted.
