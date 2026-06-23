# Checkpoint: F3 monitoring-unify — 2026-06-12

## What was done
- Merged Agents into Monitoring. `/monitoring` is now the ONE entry point with 3 tabs:
  - **Agents** (default) — mounts the rich live `<AgentsClient embedded />` (SSE + filter + cards + drawer + click-through to `/agents/[id]`). Subsumes old Local + External(api/mcp) source tabs (those ARE agent_sessions; S2 SSE already per-principal-filters api/mcp).
  - **Chat / Workflow** — read-model tables over `/api/monitoring?source=` (Q2 per-user, server-enforced). Click-through: chat→`/chat`, workflow→`/workflows/<workflowId>?run=<runId>`.
- `/agents` list page → `redirect("/monitoring?tab=agents")`. `/agents/[id]` waterfall KEPT, now `current="/monitoring"` + back-links to `/monitoring?tab=agents`.
- Nav reconciled: removed `/agents` (Bot) from header NAV + bottom-nav (replaced bottom-nav with Monitoring/Activity). No dead list link; detail links intact.
- Page-level **"data Xs ago" freshness line + Sync button** distinguish UI-live (Agents/SSE) from data-fresh (read-model). `SyncButton` got optional `onSynced` cb to re-fetch the active table.
- `AgentsClient` got `embedded` prop (drops own `<main>`+`<h1>`, keeps live dot + count).
- `read-model.ts`: workflow rows carry `workflowId` (for detail click-through). robots.ts +`/monitoring`. dashboard stuck-banner link → `/monitoring?tab=agents`.

## Files changed
- M src/app/agents/page.tsx (redirect stub) · M src/app/agents/[id]/page.tsx · M src/app/monitoring/page.tsx (initialTab from ?tab) · M src/app/robots.ts
- M src/components/monitoring/MonitoringClient.tsx (rewrite) · M src/components/agents/AgentsClient.tsx (embedded) · M src/components/app-header.tsx · M src/components/bottom-nav.tsx · M src/components/sync-button.tsx
- M src/i18n/dictionaries/monitoring.ts (3 tabs + freshness keys) · M src/i18n/dictionaries/dashboard.ts · M src/lib/monitoring/read-model.ts (workflowId)
- A src/app/agents/page.test.ts · A src/components/monitoring/MonitoringClient.test.tsx · A src/i18n/dictionaries/monitoring.test.ts

## Current state
- Targeted scope (src/components/monitoring src/components/agents src/app/monitoring src/app/agents src/i18n) = 90 pass. tsc clean. Full suite **1757 pass** (was 1746; +11 new tests). Commit `6e69321` on feat/batch2.
- Q2 intact per tab: Agents tab = SSE (S2 filter: local/claude org-shared, api/mcp per-principal); Chat/Workflow tabs = read-model `getMonitoredRuns` per-user filter. No re-broadcast/widen.
- No SSE double-subscribe: only MonitoringClient mounts one AgentsClient (when tab=agents); useLiveSessions opens/closes one EventSource on mount/unmount.

## Next steps
- None for F3. (Optional later: deep-link chat by conversationId — chat page doesn't support `?c=` yet; intentionally out of scope per Rule 2.)

## Blockers / Risks
- None. app-header.test.tsx still asserts `/agents` prefix logic (generic helper test, still TRUE) — left as-is, not dead.
