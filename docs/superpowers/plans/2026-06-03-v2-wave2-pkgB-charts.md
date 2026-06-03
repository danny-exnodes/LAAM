# V2 Wave 2 — Package W2-B (timelines + cost charts) — Sub-plan

> Owner: agent `charts`. Scope (own only): `v2/src/components/dashboard/{ActivityTimeline,CostByModel,CostByProject}.tsx` + matching `*.test.tsx`. Pure `"use client"` widgets consuming locked `Stats` slices. recharts for rendering; pure tested helpers for data mapping.

## Locked contracts (consume, don't change)
- `Stats["activity"]`: `{ t: number; sessions: number; tokens: number }[]` (t = epoch ms)
- `Stats["modelComparison"]`: `{ model; sessions; tokens; costUsd; avgDurationMs; tokensPerMin; doneRate }[]`
- `Stats["byProject"]`: `{ project; sessions; tokensIn; tokensOut; toolCalls }[]`  ← **no cost field** (unlike v1). CostByProject charts TOKEN totals per project.
- `useT(dashboard)` from `@/i18n` + `@/i18n/dictionaries/dashboard`. RTL tests wrap in `<I18nProvider lang="vi">`.
- `shortModel` from `@/lib/format` for model labels; `num` for token tick/tooltip formatting.

## Key decisions
- **CostByProject is token-based** (locked type has no cost). Use `dash.chart.tokens` label ("Tokens by project (in/out)") with stacked in/out bars, mirroring v1's stacked tokens-per-project chart — most faithful parity given the data.
- recharts `ResponsiveContainer` is zero-size in jsdom → tests assert (a) pure mapper output and (b) the component mounts without throwing / renders its title + empty state. No SVG geometry assertions.
- Each widget owns an empty state ("no data") — add ONE new dict key `dash.chart.empty` (vi/en/zh) reused by all three.
- Colors match existing v2 cost-chart accent (#6d5efc) + a secondary for the second axis/series; keep minimal palette inline (no shared palette module in scope).

## Steps (TDD — test first, then component)

### Helpers (pure, exported from each component file)
- [ ] `mapActivity(activity)` → `{ label: string; sessions: number; tokens: number }[]`; label = formatted time from `t`. Daily vs hourly bucket inferred from spacing (mirror v1: gap ≥ 86_400_000 ms → `MM/DD`, else `DD HHh`). Single-point series → hourly.
- [ ] `mapCostByModel(modelComparison, topN=12)` → `{ model: shortModel; costUsd }[]` sorted desc by costUsd, sliced to topN.
- [ ] `mapTokensByProject(byProject, topN=12)` → `{ project; tokensIn; tokensOut; total }[]` sorted desc by total, sliced topN.

### Components
- [ ] `ActivityTimeline({activity})`: ComposedChart — left Y bars=sessions, right Y line=tokens; XAxis=label; legend; tooltip; empty state when `activity.length===0`. Title `dash.chart.activity`, series labels `dash.ds.session`/`dash.ds.tokens`, axes `dash.axis.session`/`dash.axis.tokens`.
- [ ] `CostByModel({modelComparison})`: BarChart of costUsd by model; tooltip formats USD; empty state. Title `dash.cost.byModel`.
- [ ] `CostByProject({byProject})`: stacked BarChart tokensIn/tokensOut by project; tooltip formats num; empty state. Title `dash.chart.tokens`, series `dash.ds.input`/`dash.ds.output`.

## Tests (vitest + RTL)
For each: (1) mapper unit tests (sort/slice/format, empty input → []); (2) renders title with mock data without throwing; (3) renders empty state on `[]`.

## Success criteria
`cd v2 && npx vitest run src/components/dashboard/ActivityTimeline src/components/dashboard/CostByModel src/components/dashboard/CostByProject` → all green. No edits outside scope. No commit.

## Dict keys added
- `dash.chart.empty` — generic "no data" empty state (vi/en/zh).
(All other labels reuse existing dashboard dict keys.)
