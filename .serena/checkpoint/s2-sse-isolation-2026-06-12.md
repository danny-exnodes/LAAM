# Checkpoint: S2 SSE snapshot isolation — 2026-06-12

## What was done
- Fixed live leak: `/api/events` SSE broadcast ALL agent_sessions to ALL clients,
  including `api|mcp` rows carrying a real per-user `userId` (token owner).
- `SseClient` now carries the authenticated principal `{ userId, role }` (captured
  from `auth()` in GET).
- Extracted pure `visibleForClient(rows, client)` filter: `local|claude` org-shared
  (everyone); `api|mcp` per-principal (owner only, strict — no admin bypass).
- `snapshot()` now selects `userId` and returns raw `SnapshotRow[]`; per-client
  filter + map runs in `broadcastSessions` (bus path) AND the initial connect frame.
- Single DB query + single bus subscription preserved; only post-query filter +
  stringify is per-client (documented tradeoff, <50 users).
- `userId` is provenance-only — `mapRowToLiveSession` drops it, never on the wire.

## Files changed
- M src/app/api/events/route.ts
- M src/app/api/events/route.test.ts (4 unit tests for visibleForClient + 1
  two-client integration test asserting per-principal fan-out + single query)

## Current state
- Working. `npx vitest run src/app/api/events src/lib/monitoring` = 33 passed.
- `npx tsc --noEmit` clean. Full `npx vitest run` = 243 files / 1632 tests passed.
- Commit d8a4603 on branch feat/batch2.

## workflow_run forwarding (investigated)
- workflow_run / workflow_run_step payloads are `{type, runId[, nodeId, seq], status}`
  — NO userId. They are forwarded via `broadcast()` (fan-to-all) and remain so.
  Per-user workflow scoping is handled elsewhere (read-model getMonitoredRuns scopes
  workflow by viewer.userId in its own query). No change needed; left as-is.

## Next steps
- None for S2. S3 (off-boarding token revoke + soft-disable) is the next Phase S item.

## Blockers / Risks
- None. Note for F2 (notifications): per-user SSE must use a SEPARATE registry/channel
  — do NOT reuse this `sessions` broadcast (locked constraint, decision memory).
