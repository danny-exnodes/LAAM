# V2 Wave 1 — Agents Page Parity Implementation Plan

> **Coordination plan** (same model as Wave 0). TL locks shared types + does the prep step; each package is owned by ONE team agent who authors a bite-sized TDD sub-plan (superpowers:writing-plans) and executes it. Disjoint file ownership keeps parallel work conflict-free.

**Goal:** Bring the v2 Agents list + session-detail pages to parity with v1: real-time updates, filter/search bar, stuck-agent badge + browser notification, live duration ticker, sub-agent detail, tool-call waterfall, CSV export.

**Architecture:** The list page becomes client-driven via the Wave 0 `useLiveSessions()` SSE hook (no more manual "Đồng bộ"+reload). `/api/sync` publishes to the events-bus so a sync fans out to all connected clients. Detail page stays a server component (reads full row incl. subAgents/tools) + a small client waterfall. All strings via Wave 0 i18n; CSV via Wave 0 export util.

**Tech Stack:** Wave 0 foundation (useLiveSessions, isStuck, i18n useT, export downloadCsv) + recharts (already in) for the waterfall if needed; otherwise CSS bars.

---

## Depends on Wave 0 (consume, don't re-implement)
- `@/hooks/useLiveSessions` → `{sessions, connected, stuckIds}` (extended type — see TL prep)
- `@/lib/stuck` → `isStuck(s, thresholdMin)`
- `@/i18n` → `useT(agents)`, dictionaries/agents.ts (keys `agents.*` + `session.*`)
- `@/lib/export` → `downloadCsv(filename, rows, columns)`

## TL prep (done by lead BEFORE spawning — commit first)
Extend the `LiveSession` type in `v2/src/hooks/useLiveSessions.ts` with two fields so the list cards have project name + sub-agent detail:
```ts
projectName: string | null;
subAgents: import("@/db/schema").SubAgentJson[] | null;
```
(The backend package populates them; the UI package consumes them. Locking the type in prep means neither edits the other's file.)

---

## Shared Interfaces (LOCKED)

```ts
// extended LiveSession (after TL prep) — produced by /api/events, consumed by AgentsClient
type LiveSession = { /* existing W0 fields */ projectName: string | null; subAgents: SubAgentJson[] | null };

// W1-A
export function AgentsClient(): JSX.Element;          // client; uses useLiveSessions, groups by projectName
export function FilterBar(props: {
  value: AgentFilters; onChange: (f: AgentFilters) => void;
  projects: string[]; models: string[]; branches: string[];
}): JSX.Element;
export type AgentFilters = { q: string; project: string; model: string; status: string; branch: string; window: string };
export function applyFilters(sessions: LiveSession[], f: AgentFilters, now?: number): LiveSession[]; // pure, tested
export function AgentCard(props: { s: LiveSession; stuck: boolean }): JSX.Element;     // stuck badge + live ticker + sub-agent list
export function SubAgentList(props: { items: SubAgentJson[] }): JSX.Element;
export const AGENT_CSV_COLUMNS: string[];             // matches v1 export.js agent columns

// W1-B
export function ToolWaterfall(props: { calls: { name: string; durationMs: number | null; isError?: boolean }[] }): JSX.Element;
```

v1 source to port: `public/agents.{html,js}` (filters, search, stuck badge, notification, live ticker, CSV), `public/session.js` (tool waterfall/Gantt), `public/common.js` (isStuck/notify — already in W0), `public/i18n.agents.js` (keys — already ported in W0).

---

## Package W1-A — Agents list (client + filters + live + CSV) — OWNER: agent `list`

**Files (owns):** `v2/src/components/agents/AgentsClient.tsx`, `FilterBar.tsx`, `AgentCard.tsx`, `SubAgentList.tsx`, `filters.ts` (`AgentFilters` + `applyFilters` pure) + `filters.test.ts`, component tests; **rewrite** `v2/src/app/agents/page.tsx` → thin server shell (`auth()` guard + `<AgentsClient/>`).

**Detailed sub-plan:** owner authors via writing-plans. Must include:
- [ ] `applyFilters` pure fn + tests: q matches project/model/latestActivity/sub-agent type; status filter incl. `stuck` (uses isStuck); time window (1h/6h/24h/7d) on lastActivity; project/model/branch exact; empty filters → all.
- [ ] `AgentsClient`: `useLiveSessions()`, group visible sessions by `projectName` (null → "Khác"), derive project/model/branch option lists, render FilterBar + grouped cards, "X/Y session" count, CSV export button (`downloadCsv("agents.csv", filteredRows, AGENT_CSV_COLUMNS)`), live "connected" indicator. i18n via `useT(agents)`.
- [ ] `AgentCard`: status badge, stuck badge when `stuck` (red, "Nghi kẹt"), LOCAL badge, live duration ticker for running (re-render each 1s — local `useEffect` interval, not a global re-fetch), msg/tool/cost/branch, `<SubAgentList>` when subAgents present.
- [ ] `SubAgentList`: type · description · duration · status dot.
- [ ] `AGENT_CSV_COLUMNS` mirrors v1 export.js columns; rows mapped from LiveSession.
- [ ] RTL tests: filter narrows cards; stuck badge shows when stuck; CSV button calls downloadCsv (mock).

**Success criteria:** `cd v2 && npx vitest run src/components/agents src/app/agents` green; on `/agents`, typing in search narrows cards live, status=stuck filters to stuck agents, sub-agents render on cards, CSV downloads with v1 columns, list updates without manual reload.

---

## Package W1-B — Session detail (tool waterfall + sub-agent detail) — OWNER: agent `detail`

**Files (owns):** `v2/src/components/agents/ToolWaterfall.tsx` (+ test); **modify** `v2/src/app/agents/[id]/page.tsx` (add waterfall section + expand sub-agent detail from `s.subAgents`).

**Detailed sub-plan:** owner authors via writing-plans. Must include:
- [ ] `ToolWaterfall` client component: horizontal Gantt-style bars sized by `durationMs` (relative to max), error bars in red, tool name + duration label. Port the visual idea from v1 session.js. Pure layout math (bar width %) unit-tested.
- [ ] Wire into `[id]/page.tsx`: replace/augment the "Tool calls gần đây" list with `<ToolWaterfall calls={toolCalls.map(...)}/>`; add a "Sub-agents" section rendering `s.subAgents` (type/description/duration/status) when present.
- [ ] Keep existing timeline + meta intact (surgical).

**Success criteria:** `cd v2 && npx vitest run src/components/agents/ToolWaterfall` green; `/agents/[id]` shows a tool-call waterfall (bars proportional to duration, errors red) and a sub-agent detail list; `next build` clean.

---

## Package W1-C — backend: SSE enrich + bus publisher — OWNER: agent `backend`

**Files (owns):** **modify** `v2/src/app/api/events/route.ts` (enrich `snapshot()` with `projectName` via projects leftJoin + `subAgents` passthrough); **modify** `v2/src/app/api/sync/route.ts` (after `syncLocalMonitoring()`, call `publish()` from `@/lib/events-bus` so connected SSE clients refresh).

**Detailed sub-plan:** owner authors via writing-plans. Must include:
- [ ] Enrich `snapshot()` to leftJoin projects (→ `projectName`) and include `subAgents` from the row. Keep epoch-ms normalization.
- [ ] In `/api/sync` POST, after a successful sync, `publish({ type: "sync" })`; return result unchanged.
- [ ] Test: a smoke test that `/api/sync` calls publish after sync (mock syncLocalMonitoring + events-bus); a test that the enriched snapshot shape includes projectName + subAgents (mock db).

**Success criteria:** `cd v2 && npx vitest run src/app/api/sync src/app/api/events` green; manually, clicking Đồng bộ pushes fresh data to an open `/agents` tab via SSE.

---

## Integration checkpoint (coordinator, after A+B+C)
- [ ] `cd v2 && npm test` — all suites green (Wave 0 + Wave 1).
- [ ] `cd v2 && npm run build` — clean (now MarkdownView is still unused; agents pages compile).
- [ ] Manual live: open `/agents`, click Đồng bộ in another tab → list refreshes live; filters/search/stuck/CSV work; `/agents/[id]` waterfall + sub-agents render.
- [ ] Update roadmap (Wave 1 done) + Serena services/v2-app.md + checkpoint. Commit per package + integration.

## Parallel safety
- A owns components/agents/* + app/agents/page.tsx. B owns ToolWaterfall + app/agents/[id]/page.tsx. C owns api/events + api/sync. **Disjoint.** The `LiveSession` type is locked by TL prep (in hooks/useLiveSessions.ts) so neither A nor C edits it. Agents run only their own tests; don't commit; lead reviews + commits.
