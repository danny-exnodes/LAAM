# V2 Wave 2 — Package W2-C (tables + export) — Sub-plan

Owner: agent `tables`. Scope: 6 pure `"use client"` widgets under
`v2/src/components/dashboard/` + matching `*.test.tsx`. Consume the LOCKED
`Stats` shape (`@/lib/stats.types`), `useT(dashboard)` for labels,
`downloadCsv`/`downloadPdf` from `@/lib/export`. TDD.

## Shared helpers (decided)
- `format.ts` has `usd`, `num`, `shortModel` but **no duration formatter**.
  v1 `fmtDur` (h/m/s) is the canonical table formatter. I'll add one local
  `fmtDur(ms)` helper colocated in a small module `dashboard/_format.ts`
  (NOT editing `@/lib/format` — out of scope) and import it where needed.
  -> Reconsidered: keep it inside the components that need it via a tiny
  private helper file under my owned dir to avoid duplication. File:
  `v2/src/components/dashboard/_format.ts` (owned, in scope).

## Widgets (locked signatures)

1. **ModelComparisonTable({modelComparison})** — table: model / sessions /
   tokens / cost / avgDur / tokensPerMin / doneRate. shortModel for name,
   usd for cost, num for tokens/sessions/speed, fmtDur for avgDur,
   `(doneRate*100).toFixed(0)+"%"`. Empty state `dash.mdl.empty`.
   Headers from `dash.mdl.th.*`. Title `dash.mdl.title`.
2. **ToolLeaderboard({tools})** — top-12 by count desc, horizontal bars
   (width % of max count). Title `dash.tools.mostUsed`. Empty -> nothing/empty msg.
3. **ToolErrorsTable({tools})** — only errors>0, sorted by errorRate desc.
   columns tool/calls/errors/rate. Title `dash.tools.mostErrors`.
   Empty -> `dash.tools.noErrors`. Headers `dash.tools.th.*`.
4. **SlowestTools({tools})** — sorted by avgDurationMs desc, nulls last.
   horizontal bars of avgDurationMs. Title `dash.tools.slowest`.
5. **TopSessions({byDuration,byTokens})** — two lists: by duration (fmtDur),
   by tokens (num). Titles `dash.chart.topDur`/`dash.chart.topTok`. label field.
6. **DashboardExport({stats})** — CSV button -> downloadCsv("dashboard.csv",
   stats.modelComparison, ["model","sessions","tokens","costUsd",
   "avgDurationMs","tokensPerMin","doneRate"]); PDF button -> downloadPdf(
   "dashboard.pdf", title, body) — body = text summary of totals + top
   models + top tools. Labels `dash.exp.csv`/`dash.exp.pdf` + titles.

## Tests (per widget) — encode intent
- ModelComparisonTable: renders a row per model with formatted cost/doneRate;
  empty state when no rows.
- ToolLeaderboard: caps at 12 bars; sorted by count desc.
- ToolErrorsTable: hides errors==0 rows; sorts by errorRate desc; noErrors msg.
- SlowestTools: nulls sorted last; desc by avgDurationMs.
- TopSessions: both lists render their labels + formatted values.
- DashboardExport: clicking CSV calls mocked downloadCsv with the exact
  filename + columns + modelComparison rows; clicking PDF calls mocked
  downloadPdf with filename + a body containing totals/top items.

## i18n keys
All needed keys already exist in `dictionaries/dashboard.ts` (verified:
dash.mdl.*, dash.tools.*, dash.chart.topDur/topTok, dash.exp.csv/pdf + titles,
dash.pdf.*). No new keys expected; add only if a label is genuinely missing.

## Constraints
Own only the 12 files (6 tsx + 6 test + _format helper). No edits to
package.json/tsconfig/vitest, no DashboardClient/page.tsx, no kpi/charts.
Run only my tests. No commits.
