# V2 Wave 2 — Dashboard Parity Implementation Plan

> **Coordination plan.** TL owns the integration shell (`DashboardClient` + `page.tsx`); 3 agents build disjoint pure widget components under `src/components/dashboard/`. Each widget takes typed props sliced from the Wave 0 `Stats` object, is a client component, uses `useT(dashboard)` for labels, and is RTL-tested with mock data — so NO agent depends on the page or on another agent's files.

**Goal:** Bring the v2 Dashboard to parity with v1: full KPIs, status/model/branch doughnuts, dual-axis activity timeline, model-comparison table, cost breakdowns, top sessions, tool leaderboard/errors/slowest, enhanced heatmap, CSV/PDF export, i18n.

**Architecture:** `/api/stats` (Wave 0) already returns the full `Stats` object. `DashboardClient` (client) fetches it once and passes slices to pure widget components (recharts for charts; CSS grid for heatmap/tables). `page.tsx` becomes a thin server shell (auth + `<DashboardClient/>`). All labels via `useT(dictionaries/dashboard)` (provider mounted in Wave 1).

**Tech Stack:** recharts (installed), Wave 0 `Stats` types + `useT` + `downloadCsv`/`downloadPdf`.

## Depends on (consume, don't touch)
- `@/lib/stats.types` → `Stats` and sub-types (LOCKED shape)
- `GET /api/stats` → returns `Stats` (auth via same-origin cookie)
- `@/i18n` → `useT`, `dictionaries/dashboard` (106 keys ported; ADD keys only if a needed label is missing, in all 3 langs)
- `@/lib/export` → `downloadCsv`, `downloadPdf`

---

## Shared Interfaces (LOCKED) — widget prop contracts
All widgets are `"use client"`, default-styled with Tailwind to match existing dashboard cards, and call `useT(dashboard)` internally.

```ts
import type { Stats } from "@/lib/stats.types";
// W2-A (kpi)
export function KpiGrid(props: { totals: Stats["totals"] }): JSX.Element;
export function StatusDoughnut(props: { byStatus: Stats["byStatus"] }): JSX.Element;
export function ModelDoughnut(props: { byModel: Stats["byModel"] }): JSX.Element;
export function BranchDoughnut(props: { byBranch: Stats["byBranch"] }): JSX.Element;
export function Heatmap(props: { heatmap: Stats["heatmap"] }): JSX.Element; // 7×24 + hover + legend
// W2-B (charts)
export function ActivityTimeline(props: { activity: Stats["activity"] }): JSX.Element; // dual-axis sessions+tokens
export function CostByModel(props: { modelComparison: Stats["modelComparison"] }): JSX.Element;
export function CostByProject(props: { byProject: Stats["byProject"] }): JSX.Element;
// W2-C (tables)
export function ModelComparisonTable(props: { modelComparison: Stats["modelComparison"] }): JSX.Element;
export function ToolLeaderboard(props: { tools: Stats["toolLeaderboard"] }): JSX.Element; // most-used bars
export function ToolErrorsTable(props: { tools: Stats["toolLeaderboard"] }): JSX.Element; // count>0 errors, sorted
export function SlowestTools(props: { tools: Stats["toolLeaderboard"] }): JSX.Element;    // by avgDurationMs
export function TopSessions(props: { byDuration: Stats["topByDuration"]; byTokens: Stats["topByTokens"] }): JSX.Element;
export function DashboardExport(props: { stats: Stats }): JSX.Element; // CSV (model-comparison + tool tables) + PDF summary
```

v1 source to port: `public/dashboard.js` (doughnuts, timeline, per-project bars, top sessions), `public/dash-models.js` (model comparison), `public/dash-cost.js` (cost by model/project), `public/dash-tools.js` (leaderboard/errors/slowest), `public/dash-heatmap.js` (heatmap+legend), `public/export.js` (PDF report), `public/i18n.dash.js` (keys — ported to dictionaries/dashboard.ts).

---

## Package W2-A — KPIs + doughnuts + heatmap — OWNER: agent `kpi`
**Files (owns):** `src/components/dashboard/{KpiGrid,StatusDoughnut,ModelDoughnut,BranchDoughnut,Heatmap}.tsx` + tests.
**Sub-plan (writing-plans). Must include:**
- [ ] KpiGrid: render all totals (sessions, running, idle, done, messages, toolCalls, subAgents, tokensIn/Out, costUsd, avgDurationMs) as labeled cards; format via `@/lib/format` (usd/num) + a ms→human helper. Test labels+values.
- [ ] Status/Model/Branch doughnuts (recharts PieChart): map a `Record<string,number>` → slices; legend; "no data" state. Test: renders N slices for N keys; handles empty.
- [ ] Heatmap: 7×24 grid (CSS), opacity by value/max, hover tooltip (title attr) + a min/max legend swatch. Test: 168 cells; max cell highest intensity.
**Success:** `npx vitest run src/components/dashboard` (your files) green; widgets render with mock Stats slices.

## Package W2-B — timelines + cost charts — OWNER: agent `charts`
**Files (owns):** `src/components/dashboard/{ActivityTimeline,CostByModel,CostByProject}.tsx` + tests.
**Sub-plan. Must include:**
- [ ] ActivityTimeline: recharts dual-axis (left=sessions bars/line, right=tokens line) over `activity[]` ({t,sessions,tokens}); x = formatted time. Test: renders for sample series; empty state.
- [ ] CostByModel: bars of `modelComparison[].costUsd` by model (top N). CostByProject: bars of per-project token totals (tokensIn+tokensOut) from `byProject[]`. Test mappers + render.
**Success:** your vitest green; charts render without throwing.

## Package W2-C — tables + export — OWNER: agent `tables`
**Files (owns):** `src/components/dashboard/{ModelComparisonTable,ToolLeaderboard,ToolErrorsTable,SlowestTools,TopSessions,DashboardExport}.tsx` + tests.
**Sub-plan. Must include:**
- [ ] ModelComparisonTable: columns model/sessions/tokens/cost/avgDur/tokensPerMin/doneRate from `modelComparison[]`. ToolLeaderboard: top-12 most-used horizontal bars. ToolErrorsTable: tools with errors>0 sorted by errorRate. SlowestTools: sorted by avgDurationMs desc (nulls last). TopSessions: two lists (by duration, by tokens).
- [ ] DashboardExport: a "CSV" button → `downloadCsv("dashboard.csv", modelComparison rows, [model,sessions,tokens,costUsd,avgDurationMs,tokensPerMin,doneRate])`; a "PDF" button → `downloadPdf("dashboard.pdf", title, body)` where body is a text summary of totals + top models/tools. Test buttons call the (mocked) export fns.
**Success:** your vitest green; tables render; export buttons invoke export util.

---

## TL integration (coordinator, after A+B+C)
- [ ] Create `src/components/dashboard/DashboardClient.tsx` ("use client"): `fetch("/api/stats")` → loading/error/empty → compose all 14 widgets in a responsive layout; `useT(dashboard)` for section headings.
- [ ] Rewrite `src/app/dashboard/page.tsx` → thin server shell (auth + AppHeader + `<DashboardClient/>`).
- [ ] `cd v2 && npm test` (all green) + `npm run build` (clean).
- [ ] Manual: `/dashboard` shows KPIs, doughnuts, timeline, tables, heatmap, cost breakdowns; CSV/PDF download; language switch relabels.
- [ ] Update roadmap (Wave 2 done) + Serena + checkpoint; commit per package + integration; push.

## Parallel safety
A/B/C own disjoint files under components/dashboard/. DashboardClient + page.tsx are TL-owned (built last) so no agent waits on the page. Agents run only their own tests, don't commit; lead reviews + commits. `Stats` type is read-only (locked in Wave 0).
