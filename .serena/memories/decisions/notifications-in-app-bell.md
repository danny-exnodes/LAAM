# Notifications in-app bell (F2, batch2) — 2026-06-12

**Plan:** `docs/superpowers/plans/2026-06-12-batch2-...md` Phase F2. Branch `feat/batch2`.
Scope THIS round: in-app bell ONLY. Deferred (NOT built): email/Slack, org/role-broadcast,
connector-reconnect notifs, eval-emit, proactive→bell wiring, browser-Notification for the bell.

## What shipped
- **Migration 0013** (`drizzle/0013_fair_cardiac.sql`, via drizzle-kit) — table `notification`:
  id pk, **userId notnull** (per-user delivery; cascade on user delete), `audience` (reserved
  for future role-broadcast — UNUSED now), type, severity(info|warn|error), title, body?, link?,
  source(workflow|chat|system), readAt?, dedupeKey?, createdAt. Indexes: `(userId,readAt,createdAt)`
  bell query + **partial unique** `(userId,dedupeKey) WHERE dedupeKey IS NOT NULL` dedupe.
- **Lib `src/lib/notifications/index.ts`** — `create()` = SINGLE write chokepoint: insert +
  `onConflictDoUpdate` (dedupe collapses repeats, bumps createdAt + clears readAt) + publish
  `{type:'notification', userId, notification:<fresh DB row>}` (Rule 13: publish code ground-truth,
  not caller guess). `listForUser/markRead(id|'all')/unreadCount/pruneOld` — all userId-scoped.
  Adapters: `notifyWorkflowTerminal` (dedupeKey `wfrun:<runId>`, link `/workflows/<id>?run=<id>`),
  `notifyWritePending` (dedupeKey `writepending:<conv>:<tool>`, link `/chat`).
- **API** `GET /api/notifications` (own + unread count; userId from SESSION, never request),
  `PATCH /api/notifications/[id]` (markRead own), `POST /api/notifications/read-all`. markRead is
  NOT mutator-gated — reading your own notification is a personal read-state change (viewer allowed).

## CRITICAL — per-user SSE channel SEPARATE from sessions broadcast
`src/app/api/events/route.ts onBusEvent`: `if (evt.type==='notification')` → send ONLY to
`clients` where `client.userId === evt.userId`, then **`return`** (does NOT call broadcastSessions —
zero extra DB query, cannot narrow /agents). The org-shared `sessions`/`local`/`claude` fan-out
(S2 `visibleForClient`) is UNTOUCHED — locked team value-prop. Recipient userId is the routing key,
dropped from the wire payload. Tests: 2 clients diff users → notif reaches only target; userB still
gets org-shared sessions; notif triggers 0 snapshot queries.

## Single source, no double-notify
Workflow-terminal: `notify?` dep threaded into `ExecuteRunDeps`/`ResumeDeps` (OPTIONAL → existing
tests stay DB-decoupled), called fire-and-forget at the EXISTING `publish({type:'workflow_run'})`
chokepoint in `run.ts` (executeRunRow) + `resume.ts` (BOTH terminal exits). Routes wire
`notify: notifyWorkflowTerminal`: manual run route + tick route (tickExecute + tickResume). NO second
detector. Write-gate: fire-and-forget `notifyWritePending` right after the `pending_write` frame emit
in `/api/chat` (the confirm card stays primary). Proactive stuck/cost → DEFERRED (don't touch harness).

## Gotchas / notes
- Notification title/body produced SERVER-side in vi (canonical server lang) — i18n dict
  `notifications.ts` localizes only chrome (labels/empty/relTime). Bell renders title verbatim.
- `/chat` has no conversation deep-link param yet → write_pending links to `/chat` plainly.
- Mobile: header icon cluster (incl bell+badge) is always-visible → no separate BottomNav item added
  (Rule 2; 8th item would crowd the 7-item bar).
- Verify: full vitest **1741** (baseline 1702 + new), tsc clean.
