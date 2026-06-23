# Checkpoint: notifications-f2 — 2026-06-12

## What was done
- Phase F / Task F2 (in-app notification bell). In-app ONLY this round.
- Migration 0013 (drizzle-kit) — `notification` table: userId notnull (per-user),
  audience reserved, severity/title/body/link/source/readAt/dedupeKey/createdAt;
  index (userId,readAt,createdAt) + partial-unique (userId,dedupeKey).
- Lib `src/lib/notifications/index.ts`: create() chokepoint (insert + onConflict
  dedupe + publish per-user SSE event), listForUser/markRead/unreadCount/pruneOld,
  + notifyWorkflowTerminal / notifyWritePending adapters.
- Per-user SSE channel in events/route.ts onBusEvent — SEPARATE from sessions
  broadcast (sends to client.userId===evt.userId then returns; 0 extra DB query;
  org-shared local/claude fan-out untouched).
- Workflow-terminal wire: optional `notify?` dep on ExecuteRunDeps/ResumeDeps,
  called fire-and-forget at the existing workflow_run publish in run.ts + resume.ts
  (both exits) + threaded through tickExecute/tickResume; routes wire
  notifyWorkflowTerminal (manual run route + tick route).
- Write-gate wire: fire-and-forget notifyWritePending after the pending_write emit
  in /api/chat (DONE — suspend path not exercised by existing chat tests → safe).
- API: GET /api/notifications, PATCH /[id], POST /read-all (all session-scoped).
- UI: <NotificationBell> in app-header icon cluster (badge + dropdown + SSE live +
  mark-all-read), /notifications page + <NotificationsList>, i18n notifications.ts
  (vi/en/zh). Mobile uses the always-visible header bell (no BottomNav item).

## Files changed
- NEW: drizzle/0013_fair_cardiac.sql (+meta snapshot/journal)
- NEW: src/lib/notifications/index.ts (+index.test.ts)
- NEW: src/app/api/notifications/{route.ts, route.test.ts, [id]/route.ts, read-all/route.ts}
- NEW: src/app/notifications/page.tsx; src/components/{notification-bell.tsx(+test), notifications-list.tsx}
- NEW: src/i18n/dictionaries/notifications.ts (+test)
- MOD: src/db/schema.ts (notification table + sql/uniqueIndex imports)
- MOD: src/app/api/events/route.ts (notification fan-out)
- MOD: src/lib/workflow/{run.ts, resume.ts, schedule.ts} (notify dep)
- MOD: src/app/api/workflows/[id]/run/route.ts, src/app/api/workflows/tick/route.ts (wire notify)
- MOD: src/app/api/chat/route.ts (notifyWritePending), src/components/app-header.tsx (bell)
- MOD: src/app/api/events/route.test.ts, src/lib/workflow/run.test.ts (new assertions)

## Current state
- WORKING. tsc --noEmit clean. Full vitest 1741 pass (baseline 1702 + 39 new). Scoped
  set (lib/notifications, api/notifications, api/events, lib/workflow, components, i18n)
  819 pass. NOT committed yet at time of writing.
- Migration 0013 needs host db:migrate (drizzle-kit doesn't run in sandbox is N/A —
  worktree generated it fine; HOST must run `npm run db:migrate`).

## Next steps
- F3 (monitoring unify) + F4 (claude-runtime Phase 0). Host db:migrate 0013.

## Blockers / Risks
- Browser Notification for the bell DEFERRED (left useLiveSessions stuck-notify intact).
- Proactive stuck/cost NOT wired to bell (would touch harness chat route) — deferred.
- /chat has no conversation deep-link param → write_pending notif links to /chat plainly.
