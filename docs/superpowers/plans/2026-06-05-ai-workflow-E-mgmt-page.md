# AI Workflow — Phase E: Management Page Plan

> subagent-driven. Branch `feat/wf-mgmt` (base = local HEAD, backend A0–G3 done). **UI built BLIND** (no dev server per agent-ops) → component + RTL behavior tests + tsc + i18n. Live visual QA = user's review.

**Goal (req #7 + #5 + surfaces #4):** a `/workflows` management page — list + detail with run history/logs + schedule management + **realtime** (SSE) status — making the whole feature observable. Follow existing page patterns.

**Patterns to follow (read these in the worktree first):**
- `src/app/agents/` — `page.tsx` (server shell) + `AgentsClient.tsx` (client) + `src/hooks/useLiveSessions.ts` (SSE consumer of `/api/events`). Mirror this server-shell + client + live-hook structure.
- `src/app/connectors/` + `src/app/eval/` — list/detail page conventions, Tailwind styling, lucide icons.
- `src/i18n/` — the i18n engine (`useT`/`useLang`, dict files per page). Add a workflows dict for vi/en/zh.
- Nav component (find it — likely `src/components/*Nav*` or in layout) — add a `/workflows` link.

**API endpoints already available (consume these — do NOT rebuild):**
- `GET /api/workflows` (user's workflows) · `POST /api/workflows` (create blank, needs {name, graph}) · `POST /api/workflows/[id]/run` (manual trigger → {run, steps}) · `POST /api/workflows/[id]/clone`
- `GET /api/workflows/templates` · `POST /api/workflows/templates/[id]/instantiate`
- `GET /api/workflows/runs?workflowId=&status=` (runs list) · `GET /api/workflows/runs/[id]` (run + steps)
- `POST /api/workflows/schedules` (create {workflowId, cron, ...}) · `GET /api/workflows/schedules`

---

## Task 1: Realtime plumbing — forward workflow events over SSE
The engine publishes `{type:"workflow_run"|"workflow_run_step", runId, ...}` to the in-process bus (`src/lib/events-bus.ts`). The existing `/api/events` SSE route must FORWARD these to clients (today it may only emit session snapshots). 
- Inspect `src/app/api/events/route.ts`. Make it forward `workflow_run`/`workflow_run_step` events as SSE messages (a distinct event type or a JSON payload the client filters). Keep existing session behavior intact.
- Add `src/hooks/useWorkflowEvents.ts` — subscribes to `/api/events`, filters `workflow_*`, exposes the latest run/step updates (callback or state). Model on `useLiveSessions`.
- Test: a unit/RTL test that the hook parses a `workflow_run_step` SSE frame and surfaces it. (If SSE is hard to unit-test, test the parse/filter function in isolation.)
- Commit `feat(workflow): E realtime — forward workflow events over SSE + useWorkflowEvents`.

## Task 2: `/workflows` list page
- `src/app/workflows/page.tsx` (server shell, auth-gated like other pages) + `src/components/workflows/WorkflowsClient.tsx` (client).
- Fetches `GET /api/workflows`; for each workflow show name, status, isTemplate badge, and last-run status (from `GET /api/workflows/runs?workflowId=` — or a lightweight rollup; keep it simple: fetch recent runs once + map). 
- Row actions: **Run now** (`POST [id]/run`), **View** (→ `/workflows/[id]`), **Clone** (`POST [id]/clone`), **Edit** (→ `/workflows/[id]/edit` — Phase D; link can exist even before D ships).
- Top actions: **New from template** (modal/dropdown listing `GET /api/workflows/templates`, instantiate on pick) + **New blank** (creates a minimal workflow via `POST /api/workflows` then → edit).
- **Realtime:** use `useWorkflowEvents` to update a workflow's last-run status live when a run progresses.
- **Needs-attention:** failed runs visually flagged (e.g. red badge).
- Add `/workflows` to the main nav.
- RTL test: renders a workflow list from mocked fetch; Run-now button posts; needs-attention badge shows for a failed run.
- Commit `feat(workflow): E /workflows list page + nav`.

## Task 3: `/workflows/[id]` detail page
- `src/app/workflows/[id]/page.tsx` + `src/components/workflows/WorkflowDetailClient.tsx`.
- Sections: (a) workflow header (name, status, graph node-count summary); (b) **Runs history** (`GET /api/workflows/runs?workflowId`): each run row = status/trigger/started/duration; click → expand to **steps** (`GET /api/workflows/runs/[id]`) showing each node's seq/kind/status/output/error — this IS the per-run log (req #5); (c) **Schedule** (`GET/POST /api/workflows/schedules`): show current cron + a form to set/enable cron (req #4); (d) **Run now** button.
- **Realtime:** `useWorkflowEvents` updates the in-flight run's step statuses live (req #7).
- RTL test: renders runs + expands steps from mocked fetch; schedule form posts cron; run-now posts.
- Commit `feat(workflow): E /workflows/[id] detail — runs/steps log + schedule + run-now`.

## Task 4: i18n
- Add a `workflows` dict (vi/en/zh) covering all new UI strings; wire via the existing i18n engine. (Per CLAUDE.md: all 3 languages.)
- Commit `feat(workflow): E i18n (vi/en/zh)`.

## Task 5: Verify
- `npx tsc --noEmit` → 0. `npx vitest run` → all green (report count). (No live preview — flag for user QA.)
- Do NOT run `next dev`/`build` (agent-ops; prod may be running).

## Self-review
list+detail render real endpoint data? realtime hook wired? run-log (steps) visible (#5)? schedule UI (#4)? needs-attention? nav link? i18n 3 langs? tsc 0 + suite green? (Visual correctness deferred to user QA — documented.)
