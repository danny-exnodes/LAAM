# Wave 2 — Package W2-A (KPIs + doughnuts + heatmap) — sub-plan

Owner: agent `kpi`. Scope: 5 pure `"use client"` widgets under
`v2/src/components/dashboard/` + matching `*.test.tsx`. Consume `Stats`
slices (LOCKED) from `@/lib/stats.types`; labels via `useT(dashboard)`
(`@/i18n/provider` + `@/i18n/dictionaries/dashboard`); numbers via
`@/lib/format` (`usd`/`num`). recharts `PieChart` for doughnuts; CSS grid
for heatmap. RTL tests wrap in `<I18nProvider lang="vi">`.

## Conventions confirmed (from existing code)
- `useT` is imported from `@/i18n/provider`; pass the `dashboard` Dict.
- Cards: `rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900` (match AgentCard).
- recharts pattern: fixed-height wrapper `div` + `<ResponsiveContainer>` (jsdom has no layout → ResponsiveContainer renders 0×0; tests assert on legend/labels/empty-state DOM, NOT chart geometry).
- Dashboard dict already has every label I need (`dash.kpi.*`, `dash.st.*`, `dash.chart.status/model/branch`, `dash.hm.*`). PREFER existing; add only if missing.

## Components

### 1. KpiGrid({ totals })
- Cards for: sessions, running, idle, done, messages, toolCalls, subAgents, tokensIn, tokensOut, costUsd, avgDurationMs.
- Labels: reuse `dash.kpi.sessions/running/messages/toolCalls/avgDur`, `dash.st.idle/done`, `dash.ds.input/output`, `dash.kpi.tokensTotal`. ADD keys only for genuinely-missing labels (idle, done as standalone KPIs → reuse `dash.st.*`; subAgents → `dash.kpi.sub.subAgents` is a sub-template, need a standalone label → ADD `dash.kpi.subAgents`; tokensIn/Out standalone → reuse `dash.ds.input/output`; costUsd → ADD `dash.kpi.cost`).
- Format: `num()` for counts/tokens, `usd()` for cost, local `fmtDur(ms)` (ms→human) for avgDurationMs.
- TEST: renders a card for each total; asserts label text + formatted value (e.g. cost via usd, tokens via num).

### 2/3/4. StatusDoughnut / ModelDoughnut / BranchDoughnut
- Shared internal `Doughnut` helper: takes `Record<string,number>` + title + color palette → recharts `PieChart`/`Pie` (innerRadius for doughnut) + `Legend`, inside fixed-height wrapper.
- StatusDoughnut: title `dash.chart.status`; relabel running/idle/done via `dash.st.*`; status colors (green/amber/neutral).
- ModelDoughnut: title `dash.chart.model`; `shortModel()` labels; series palette.
- BranchDoughnut: title `dash.chart.branch`; series palette.
- Empty state (`{}` / all-zero) → "no data" text (`dash.hm.empty` is heatmap-specific; ADD `dash.chart.empty` generic "no data" — used by all 3 doughnuts).
- TEST: N keys → renders the title + N legend labels (recharts `<Legend>` renders label DOM even at 0×0... verify; if not, render an accessible label list ourselves). Empty Record → shows empty text, no crash.

### 5. Heatmap({ heatmap })  — heatmap is number[][] [7][24]
- 7×24 CSS grid; opacity = value/max (floor 0.08 like v1); hour header (label 0,3,6,…); day labels via `dash.hm.day.*` (Sun-first, index 0=Sun).
- Each cell `title` = `dash.hm.cellTitle {day,hr,n}`.
- Legend: low/high swatch via `dash.hm.low` / `dash.hm.high {max}`.
- Empty (max<=0) → `dash.hm.empty`.
- TEST: 168 cells rendered; max-value cell carries highest intensity (assert inline opacity/style); empty grid → empty text.

## Success criteria
`cd v2 && npx vitest run src/components/dashboard/{KpiGrid,StatusDoughnut,ModelDoughnut,BranchDoughnut,Heatmap}` all green. tsc-clean (no `any` leaks). No edits outside my owned files except dictionaries/dashboard.ts (ADD-only, all 3 langs) — flagged to TL.

## Risk: recharts in jsdom
ResponsiveContainer needs layout; jsdom gives 0 size → chart svg may be empty. Mitigation: tests assert on our own rendered DOM (titles, legend label spans we control, empty state, heatmap cells) rather than recharts internals. If recharts `<Legend>` labels don't render in jsdom, render a parallel sr-only/visible label list keyed off the data so the contract (N labels) is testable deterministically.
