# Eval Tracking Page ("Độ tin cậy Agent") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`).
> **Spec:** `docs/superpowers/specs/2026-06-05-eval-tracking-page-design.md` · **Eval harness:** PR #2 `feat/harness-eval` (must be present — branch from it or from main after merging PR #2).
> **Isolation:** Run on a worktree/branch that INCLUDES the eval harness (`scripts/eval/*` + suite.eval.ts). Recommended: merge PR #2 → main, branch from main.

**Goal:** A `/eval` page in the LAAM app that shows the Agent's reliability over time (headline % + per-dimension trend + latest scorecard + run list), backed by a new `eval_run` table the eval populates each run.

**Architecture:** `npm run eval` persists one `eval_run` row (best-effort) alongside its JSON. A pure `buildEvalDashboard()` turns rows into headline/trend/latest/list. The `/eval` server component queries the table, builds the dashboard, and renders it (recharts trend in a client child). All aggregation is pure + unit-tested.

**Tech Stack:** Drizzle/Postgres (new table + migration 0004) · Next.js server component + client chart · recharts (`useChartTheme`) · in-house i18n (`useT` + Dict, vi/en/zh) · vitest.

**Import conventions:** app code via `@/`; the eval persist helper lives under `scripts/eval/` and imports `@/db` + `@/db/schema`.

---

## File Structure

```
src/db/schema.ts                         # MODIFY: + evalRuns table + EvalRun/EvalScenarioScore/EvalDims types
drizzle/0004_*.sql                       # NEW (generated on host): db:generate → commit → db:migrate
scripts/eval/report.ts                   # MODIFY: extract+export aggregateDims(scores); renderScorecard reuses it
scripts/eval/report.test.ts              # MODIFY: + aggregateDims test
scripts/eval/persist-run.ts (+ .test.ts) # NEW: persistEvalRun(db, meta, scores) — inserts an eval_run row
scripts/eval/suite.eval.ts               # MODIFY: afterAll → persistEvalRun best-effort + EVAL_LABEL + gitSha
src/lib/eval-stats.ts (+ .test.ts)       # NEW: buildEvalDashboard(rows) + overallOf(dims) — PURE
src/i18n/dictionaries/eval.ts            # NEW: evalDict (vi/en/zh)
src/components/eval/TrendChart.tsx       # NEW: recharts LineChart (+ exported mapTrend, tested)
src/components/eval/TrendChart.test.ts   # NEW: mapTrend test
src/components/eval/HeadlineCard.tsx     # NEW
src/components/eval/LatestTable.tsx      # NEW
src/components/eval/RunList.tsx          # NEW
src/components/eval/EvalClient.tsx       # NEW: "use client" — composes the four above
src/app/eval/page.tsx                    # NEW: server component (query eval_run → buildEvalDashboard → EvalClient)
src/components/app-header.tsx            # MODIFY: + NAV item /eval
src/components/bottom-nav.tsx            # MODIFY: + mobile nav item /eval
```

Boundaries: data/logic (schema, aggregateDims, persistEvalRun, eval-stats) are pure/server + unit-tested in `npm test`. UI components follow the existing dashboard-chart + page patterns.

---

### Task 1: Schema — `eval_run` table + types

**Files:**
- Modify: `src/db/schema.ts` (append after `connectorCredentials`/types block)
- Migration: `drizzle/0004_*.sql` (generated on host)

- [ ] **Step 1: Add the table + types** to `src/db/schema.ts` (end of file, after existing exports)

```ts
// ---------------------------------------------------------------------------
// Eval (reliability tracking). One row per `npm run eval` run. Populated by
// scripts/eval/persist-run.ts; surfaced by /eval. `dims` is the per-dimension
// aggregate (cheap trend reads); `scores` is the full per-scenario detail.
// ---------------------------------------------------------------------------

// Mirror of the eval's ScenarioScore (scripts/eval/types.ts). Declared here so
// the app never imports from scripts/eval — the JSONB shape IS the contract.
export type EvalScenarioScore = {
  id: string;
  capability: string;
  runs: number;
  perDim: Record<string, { passed: number; total: number }>;
  fails: string[];
  avgMs: number;
};
export type EvalDims = Record<string, { passed: number; total: number }>;

export const evalRuns = pgTable("eval_run", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ranAt: timestamp("ranAt", { mode: "date" }).notNull().defaultNow(),
  model: text("model").notNull(),
  k: integer("k").notNull().default(1),
  label: text("label"),
  gitSha: text("gitSha"),
  totalScenarios: integer("totalScenarios").notNull().default(0),
  totalRuns: integer("totalRuns").notNull().default(0),
  dims: jsonb("dims").$type<EvalDims>().notNull(),
  scores: jsonb("scores").$type<EvalScenarioScore[]>().notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});
export type EvalRun = typeof evalRuns.$inferSelect;
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exit 0 (no new errors). `pgTable/text/integer/jsonb/timestamp` already imported at top of schema.ts.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(eval): eval_run table + EvalRun/EvalScenarioScore types"
```

- [ ] **Step 4 (HOST, user): generate + apply migration**

Run (host): `npm run db:generate` → review `drizzle/0004_*.sql` (CREATE TABLE eval_run) → commit it → `npm run db:migrate`.
Expected: table `eval_run` exists. (drizzle-kit does not run in the agent sandbox — this step is host/user, per `db-migrations` decision.)

```bash
git add drizzle/
git commit -m "chore(db): migration 0004 — eval_run"
```

---

### Task 2: `aggregateDims` — extract from report.ts (DRY) + test

**Files:**
- Modify: `scripts/eval/report.ts:14-22` (renderScorecard totals → use aggregateDims)
- Modify: `scripts/eval/report.test.ts` (+ test)

- [ ] **Step 1: Write the failing test** — append to `scripts/eval/report.test.ts`

```ts
import { aggregateDims } from "./report";

describe("aggregateDims", () => {
  test("sums passed/total per dimension across scenarios", () => {
    const scores = [
      { id: "a", capability: "tool-selection", runs: 5, perDim: { "tool-selection": { passed: 5, total: 5 }, grounding: { passed: 3, total: 5 } }, fails: [], avgMs: 0 },
      { id: "b", capability: "tool-selection", runs: 5, perDim: { "tool-selection": { passed: 4, total: 5 } }, fails: [], avgMs: 0 },
    ];
    const dims = aggregateDims(scores as never);
    expect(dims["tool-selection"]).toEqual({ passed: 9, total: 10 });
    expect(dims["grounding"]).toEqual({ passed: 3, total: 5 });
    expect(dims["args"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- scripts/eval/report.test.ts`
Expected: FAIL — `aggregateDims` is not exported.

- [ ] **Step 3: Refactor report.ts** — add `aggregateDims` and use it in `renderScorecard`. Replace the body of `renderScorecard`'s totals computation:

Add near the top (after `cell`):
```ts
// Per-dimension aggregate (passed/total summed across scenarios that graded it).
// Shared by the scorecard totals row and the DB persist (persist-run.ts).
export function aggregateDims(scores: ScenarioScore[]): Record<string, { passed: number; total: number }> {
  const out: Record<string, { passed: number; total: number }> = {};
  for (const s of scores) {
    for (const [dim, c] of Object.entries(s.perDim)) {
      const cell = (out[dim] ??= { passed: 0, total: 0 });
      cell.passed += c.passed;
      cell.total += c.total;
    }
  }
  return out;
}
```
Then change the `totals` line in `renderScorecard` to reuse it:
```ts
  const agg = aggregateDims(scores);
  const totals = DIMS.map((d) => {
    const c = agg[d];
    return c && c.total ? `${Math.round((100 * c.passed) / c.total)}%` : "—";
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- scripts/eval/report.test.ts`
Expected: PASS (existing renderScorecard test + new aggregateDims test). Scorecard output unchanged.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/report.ts scripts/eval/report.test.ts
git commit -m "refactor(eval): extract aggregateDims (shared by scorecard + persist)"
```

---

### Task 3: `persistEvalRun` + wire into suite.eval (best-effort)

**Files:**
- Create: `scripts/eval/persist-run.ts`, `scripts/eval/persist-run.test.ts`
- Modify: `scripts/eval/suite.eval.ts`

- [ ] **Step 1: Write the failing test** — `scripts/eval/persist-run.test.ts`

```ts
import { describe, expect, test, vi } from "vitest";
import { buildEvalRow } from "./persist-run";

describe("buildEvalRow", () => {
  test("maps meta+scores to an eval_run row (dims aggregated, totals computed)", () => {
    const scores = [
      { id: "a", capability: "tool-selection", runs: 5, perDim: { "tool-selection": { passed: 5, total: 5 } }, fails: [], avgMs: 10 },
      { id: "b", capability: "args", runs: 5, perDim: { args: { passed: 4, total: 5 } }, fails: ["x"], avgMs: 20 },
    ];
    const row = buildEvalRow({ k: 5, model: "qwen3", at: "2026-06-05" }, scores as never, { label: "step1", gitSha: "abc123" });
    expect(row.model).toBe("qwen3");
    expect(row.k).toBe(5);
    expect(row.label).toBe("step1");
    expect(row.gitSha).toBe("abc123");
    expect(row.totalScenarios).toBe(2);
    expect(row.totalRuns).toBe(10); // 2 scenarios * k=5
    expect(row.dims["tool-selection"]).toEqual({ passed: 5, total: 5 });
    expect(row.dims["args"]).toEqual({ passed: 4, total: 5 });
    expect(row.scores).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- scripts/eval/persist-run.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** `scripts/eval/persist-run.ts`

```ts
import { db } from "@/db";
import { evalRuns, type EvalScenarioScore } from "@/db/schema";
import { aggregateDims } from "./report";
import type { ScenarioScore } from "./types";

type Meta = { k: number; model: string; at: string };
type Extra = { label?: string | null; gitSha?: string | null };

// Pure: shape an eval_run insert from a run's meta + scores. Tested without DB.
export function buildEvalRow(meta: Meta, scores: ScenarioScore[], extra: Extra = {}) {
  return {
    model: meta.model,
    k: meta.k,
    label: extra.label ?? null,
    gitSha: extra.gitSha ?? null,
    totalScenarios: scores.length,
    totalRuns: scores.length * meta.k,
    dims: aggregateDims(scores),
    scores: scores as unknown as EvalScenarioScore[],
  };
}

// Best-effort DB insert. Throws are the caller's to swallow (suite keeps the JSON).
export async function persistEvalRun(meta: Meta, scores: ScenarioScore[], extra: Extra = {}): Promise<void> {
  await db.insert(evalRuns).values(buildEvalRow(meta, scores, extra));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- scripts/eval/persist-run.test.ts`
Expected: PASS (buildEvalRow test; persistEvalRun not unit-tested — it touches the DB, exercised live on host).

- [ ] **Step 5: Wire into `scripts/eval/suite.eval.ts`** — extend the afterAll. Replace the `afterAll` block:

```ts
import { execSync } from "node:child_process";
// ...existing imports plus:
import { persistEvalRun } from "./persist-run";

// ...inside describe, replace afterAll:
  afterAll(async () => {
    if (!scores.length) return;
    const path = await writeScorecard(scores, { k: K, model: cfg.model, at });
    console.log(`\n[eval] scorecard → ${path}`);
    // Best-effort: persist to DB for the /eval page. Never fail the run on DB issues.
    try {
      const label = process.env.EVAL_LABEL || null;
      let gitSha: string | null = null;
      try { gitSha = execSync("git rev-parse --short HEAD").toString().trim(); } catch { /* no git */ }
      await persistEvalRun({ k: K, model: cfg.model, at }, scores, { label, gitSha });
      console.log(`[eval] persisted run to DB (label=${label ?? "—"})`);
    } catch (e) {
      console.warn("[eval] DB persist skipped (fail-soft):", e instanceof Error ? e.message : e);
    }
  });
```

- [ ] **Step 6: Verify the suite still collects (no live run)**

Run: `npx vitest list -c vitest.eval.config.ts`
Expected: still lists the 10 scenarios; import chain (now incl. persist-run → @/db) resolves. Do NOT run the live eval here (host/user step).

- [ ] **Step 7: Commit**

```bash
git add scripts/eval/persist-run.ts scripts/eval/persist-run.test.ts scripts/eval/suite.eval.ts
git commit -m "feat(eval): persist each run to eval_run (best-effort) + label/gitSha"
```

---

### Task 4: `eval-stats.ts` — buildEvalDashboard (PURE) + tests

**Files:**
- Create: `src/lib/eval-stats.ts`, `src/lib/eval-stats.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/eval-stats.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { overallOf, buildEvalDashboard } from "./eval-stats";
import type { EvalRun } from "@/db/schema";

const mkRun = (over: Partial<EvalRun>): EvalRun => ({
  id: "r", ranAt: new Date("2026-06-05T10:00:00Z"), model: "qwen3", k: 5,
  label: null, gitSha: null, totalScenarios: 2, totalRuns: 10,
  dims: { "tool-selection": { passed: 8, total: 10 }, args: { passed: 10, total: 10 } },
  scores: [], createdAt: new Date(), ...over,
});

describe("overallOf", () => {
  test("total passed / total graded across dims", () => {
    expect(overallOf({ a: { passed: 8, total: 10 }, b: { passed: 10, total: 10 } })).toBe(90);
  });
  test("0 graded → 0", () => expect(overallOf({})).toBe(0));
});

describe("buildEvalDashboard", () => {
  test("empty → null headline/latest, empty trend/runs", () => {
    const d = buildEvalDashboard([]);
    expect(d.headline).toBeNull();
    expect(d.latest).toBeNull();
    expect(d.trend).toEqual([]);
  });
  test("headline = latest overall + delta vs previous; trend is ASC", () => {
    // rows are DESC by ranAt (newest first), as the page queries them
    const newer = mkRun({ id: "new", ranAt: new Date("2026-06-05T12:00:00Z"), label: "step2", dims: { a: { passed: 10, total: 10 } } }); // 100%
    const older = mkRun({ id: "old", ranAt: new Date("2026-06-05T09:00:00Z"), label: "step1", dims: { a: { passed: 8, total: 10 } } }); // 80%
    const d = buildEvalDashboard([newer, older]);
    expect(d.headline!.overallPct).toBe(100);
    expect(d.headline!.deltaVsPrev).toBe(20); // 100 - 80
    expect(d.headline!.label).toBe("step2");
    expect(d.trend.map((p) => p.run)).toEqual(["step1", "step2"]); // ASC, label preferred
    expect(d.latest!.dims).toEqual(newer.dims);
    expect(d.runs.map((r) => r.id)).toEqual(["new", "old"]); // DESC
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/eval-stats.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** `src/lib/eval-stats.ts`

```ts
import type { EvalRun, EvalDims, EvalScenarioScore } from "@/db/schema";

// Overall reliability = total passed / total graded across ALL dimensions (honest;
// includes write-intent — annotated in the UI, not cherry-picked). 0 if nothing graded.
export function overallOf(dims: EvalDims): number {
  let p = 0, t = 0;
  for (const c of Object.values(dims)) { p += c.passed; t += c.total; }
  return t ? Math.round((100 * p) / t) : 0;
}

function pctOf(c: { passed: number; total: number } | undefined): number | null {
  return c && c.total ? Math.round((100 * c.passed) / c.total) : null;
}

export type TrendPoint = { run: string; overall: number; perDim: Record<string, number | null> };
export type EvalDashboard = {
  headline: { overallPct: number; deltaVsPrev: number | null; ranAt: Date; label: string | null; model: string } | null;
  trend: TrendPoint[];
  latest: { scores: EvalScenarioScore[]; dims: EvalDims } | null;
  runs: { id: string; ranAt: Date; label: string | null; model: string; overallPct: number }[];
};

const DIMS = ["tool-selection", "args", "grounding", "restraint", "termination", "write-intent", "rich-block"];

// rows: DESC by ranAt (newest first), as the /eval page queries them.
export function buildEvalDashboard(rows: EvalRun[]): EvalDashboard {
  if (!rows.length) return { headline: null, trend: [], latest: null, runs: [] };
  const [latest, prev] = rows;
  const latestPct = overallOf(latest.dims);
  const asc = [...rows].reverse();
  return {
    headline: {
      overallPct: latestPct,
      deltaVsPrev: prev ? latestPct - overallOf(prev.dims) : null,
      ranAt: latest.ranAt,
      label: latest.label,
      model: latest.model,
    },
    trend: asc.map((r) => ({
      run: r.label || r.ranAt.toISOString().slice(5, 10), // label preferred, else MM-DD
      overall: overallOf(r.dims),
      perDim: Object.fromEntries(DIMS.map((d) => [d, pctOf(r.dims[d])])),
    })),
    latest: { scores: latest.scores, dims: latest.dims },
    runs: rows.map((r) => ({ id: r.id, ranAt: r.ranAt, label: r.label, model: r.model, overallPct: overallOf(r.dims) })),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/eval-stats.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/eval-stats.ts src/lib/eval-stats.test.ts
git commit -m "feat(eval): buildEvalDashboard + overallOf (pure, tested)"
```

---

### Task 5: i18n dict + nav items

**Files:**
- Create: `src/i18n/dictionaries/eval.ts`
- Modify: `src/components/app-header.tsx`, `src/components/bottom-nav.tsx`

- [ ] **Step 1: Create `src/i18n/dictionaries/eval.ts`**

```ts
import type { Dict } from "../types";

export const evalDict: Dict = {
  "eval.title": { vi: "Độ tin cậy Agent", en: "Agent Reliability", zh: "Agent 可靠性" },
  "eval.subtitle": { vi: "Đo qua từng lần chạy eval", en: "Measured across eval runs", zh: "按每次评测衡量" },
  "eval.overall": { vi: "Độ tin cậy tổng", en: "Overall reliability", zh: "总体可靠性" },
  "eval.vsPrev": { vi: "so với lần trước", en: "vs previous", zh: "对比上次" },
  "eval.trend": { vi: "Tiến bộ theo thời gian", en: "Progress over time", zh: "随时间的进步" },
  "eval.latest": { vi: "Scorecard mới nhất", en: "Latest scorecard", zh: "最新评分卡" },
  "eval.runs": { vi: "Các lần chạy", en: "Runs", zh: "运行记录" },
  "eval.scenario": { vi: "Kịch bản", en: "Scenario", zh: "场景" },
  "eval.empty": { vi: "Chưa có lần chạy eval nào. Chạy `npm run eval` trên host để bắt đầu.", en: "No eval runs yet. Run `npm run eval` on the host to start.", zh: "暂无评测运行。在主机上运行 `npm run eval` 开始。" },
  "eval.col.overall": { vi: "Tổng", en: "Overall", zh: "总体" },
  "eval.col.model": { vi: "Model", en: "Model", zh: "模型" },
  "eval.col.label": { vi: "Bước", en: "Step", zh: "步骤" },
  "eval.col.date": { vi: "Ngày", en: "Date", zh: "日期" },
  // dimension labels
  "eval.dim.tool-selection": { vi: "Chọn tool", en: "Tool selection", zh: "工具选择" },
  "eval.dim.args": { vi: "Tham số", en: "Arguments", zh: "参数" },
  "eval.dim.grounding": { vi: "Bám dữ liệu", en: "Grounding", zh: "数据依据" },
  "eval.dim.restraint": { vi: "Tiết chế", en: "Restraint", zh: "克制" },
  "eval.dim.termination": { vi: "Dừng đúng", en: "Termination", zh: "正确终止" },
  "eval.dim.write-intent": { vi: "Ý định ghi", en: "Write intent", zh: "写入意图" },
  "eval.dim.rich-block": { vi: "Khối chart/map", en: "Chart/map block", zh: "图表/地图块" },
  "eval.writeNote": { vi: "0% là chủ ý: hành động ghi bị chặn bởi safety-gate; model không được tự thuật \"đã xong\".", en: "0% is by design: writes are blocked by the safety gate; the model must not claim completion.", zh: "0% 属设计：写操作被安全门拦截，模型不得声称已完成。" },
};
```

- [ ] **Step 2: Add the desktop nav item** in `src/components/app-header.tsx` — add `Gauge` to the lucide import and a `NAV` entry (place after Agents):

```ts
import { LayoutDashboard, MessageSquare, Bot, Network, Plug, Settings, Gauge } from "lucide-react";
// ...
const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/chat", label: "Chat", Icon: MessageSquare },
  { href: "/agents", label: "Agents", Icon: Bot },
  { href: "/eval", label: "Reliability", Icon: Gauge },
  { href: "/graph", label: "Graph", Icon: Network },
  { href: "/connectors", label: "Connectors", Icon: Plug },
  { href: "/settings", label: "Settings", Icon: Settings },
];
```

- [ ] **Step 3: Add the mobile nav item** in `src/components/bottom-nav.tsx` — FIRST read the file to match its exact nav-array shape, then add the same `{ href: "/eval", label: "Reliability", Icon: Gauge }` entry (import `Gauge` from lucide-react). (Mirror whatever structure bottom-nav uses; keep it consistent with app-header.)

- [ ] **Step 4: Verify build/typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (No test for static nav/dict; covered by the page render later.)

- [ ] **Step 5: Commit**

```bash
git add src/i18n/dictionaries/eval.ts src/components/app-header.tsx src/components/bottom-nav.tsx
git commit -m "feat(eval): /eval i18n dict (vi/en/zh) + nav items"
```

---

### Task 6: TrendChart (recharts) + mapTrend test

**Files:**
- Create: `src/components/eval/TrendChart.tsx`, `src/components/eval/TrendChart.test.ts`

Pattern: follow `src/components/dashboard/TokensByDay.tsx` (client, recharts, `useChartTheme`, exported pure mapper).

- [ ] **Step 1: Write the failing test** — `src/components/eval/TrendChart.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { trendLines } from "./TrendChart";
import type { TrendPoint } from "@/lib/eval-stats";

describe("trendLines", () => {
  test("returns one series key per dimension present + overall, skipping all-null dims", () => {
    const trend: TrendPoint[] = [
      { run: "s1", overall: 80, perDim: { "tool-selection": 80, args: null, grounding: 60 } },
      { run: "s2", overall: 100, perDim: { "tool-selection": 100, args: null, grounding: 100 } },
    ];
    const keys = trendLines(trend);
    expect(keys).toContain("overall");
    expect(keys).toContain("tool-selection");
    expect(keys).toContain("grounding");
    expect(keys).not.toContain("args"); // all null → skipped
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/components/eval/TrendChart.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** `src/components/eval/TrendChart.tsx`

```tsx
"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import { useT } from "@/i18n/provider";
import { evalDict } from "@/i18n/dictionaries/eval";
import { useChartTheme } from "@/hooks/useChartTheme";
import type { TrendPoint } from "@/lib/eval-stats";

const DIM_COLORS: Record<string, string> = {
  "tool-selection": "#6d5efc", args: "#0ea5e9", grounding: "#22c55e",
  restraint: "#f59e0b", termination: "#14b8a6", "write-intent": "#ef4444", "rich-block": "#a855f7",
};

// Which line series to draw: "overall" + every dimension that has ≥1 non-null point.
export function trendLines(trend: TrendPoint[]): string[] {
  const dims = new Set<string>();
  for (const p of trend) for (const [d, v] of Object.entries(p.perDim)) if (v !== null) dims.add(d);
  return ["overall", ...dims];
}

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const t = useT(evalDict);
  const theme = useChartTheme();
  // recharts needs flat rows: { run, overall, <dim>:pct, ... }
  const data = trend.map((p) => ({ run: p.run, overall: p.overall, ...p.perDim }));
  const lines = trendLines(trend);

  return (
    <div className="chart-card">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("eval.trend")}</h3>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="run" tick={{ fontSize: 11, fill: theme.axis }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: theme.axis }} width={36} tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v) => (v == null ? "—" : `${v}%`)} contentStyle={theme.tooltip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {lines.map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key === "overall" ? t("eval.overall") : t(`eval.dim.${key}`)}
                stroke={key === "overall" ? "#111827" : (DIM_COLORS[key] ?? "#888")}
                strokeWidth={key === "overall" ? 3 : 1.5}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/components/eval/TrendChart.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/eval/TrendChart.tsx src/components/eval/TrendChart.test.ts
git commit -m "feat(eval): TrendChart (recharts per-dimension + overall)"
```

---

### Task 7: HeadlineCard + LatestTable + RunList

**Files:**
- Create: `src/components/eval/HeadlineCard.tsx`, `LatestTable.tsx`, `RunList.tsx`

All `"use client"` (consume `useT`). No new logic → no separate tests (covered by page render + eval-stats tests).

- [ ] **Step 1: `HeadlineCard.tsx`**

```tsx
"use client";
import { useT } from "@/i18n/provider";
import { evalDict } from "@/i18n/dictionaries/eval";
import type { EvalDashboard } from "@/lib/eval-stats";

export function HeadlineCard({ headline }: { headline: NonNullable<EvalDashboard["headline"]> }) {
  const t = useT(evalDict);
  const d = headline.deltaVsPrev;
  const arrow = d == null ? "" : d > 0 ? "▲" : d < 0 ? "▼" : "=";
  const color = d == null ? "text-neutral-400" : d > 0 ? "text-green-600" : d < 0 ? "text-red-600" : "text-neutral-400";
  return (
    <div className="chart-card">
      <p className="text-sm text-neutral-500">{t("eval.overall")}</p>
      <div className="flex items-baseline gap-3">
        <span className="text-5xl font-bold tracking-tight">{headline.overallPct}%</span>
        {d != null && <span className={`text-sm font-medium ${color}`}>{arrow} {Math.abs(d)}% {t("eval.vsPrev")}</span>}
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        {headline.label ? `${headline.label} · ` : ""}{headline.model} · {headline.ranAt.toISOString().slice(0, 10)}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: `LatestTable.tsx`** (scenario × dimension; mirrors the scorecard .md; includes the write-intent note)

```tsx
"use client";
import { useT } from "@/i18n/provider";
import { evalDict } from "@/i18n/dictionaries/eval";
import type { EvalDashboard } from "@/lib/eval-stats";

const DIMS = ["tool-selection", "args", "grounding", "restraint", "termination", "write-intent", "rich-block"];

export function LatestTable({ latest }: { latest: NonNullable<EvalDashboard["latest"]> }) {
  const t = useT(evalDict);
  const cell = (c?: { passed: number; total: number }) =>
    !c ? "—" : `${c.passed}/${c.total}`;
  const tone = (c?: { passed: number; total: number }) =>
    !c ? "" : c.passed === 0 ? "text-red-600" : c.passed < c.total ? "text-amber-600" : "text-green-600";
  return (
    <div className="chart-card overflow-x-auto">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("eval.latest")}</h3>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-neutral-400">
            <th className="py-1 pr-2">{t("eval.scenario")}</th>
            {DIMS.map((d) => <th key={d} className="px-2 py-1">{t(`eval.dim.${d}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {latest.scores.map((s) => (
            <tr key={s.id} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1 pr-2 font-medium">{s.id}</td>
              {DIMS.map((d) => <td key={d} className={`px-2 py-1 ${tone(s.perDim[d])}`}>{cell(s.perDim[d])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-neutral-400">ℹ️ {t("eval.writeNote")}</p>
    </div>
  );
}
```

- [ ] **Step 3: `RunList.tsx`**

```tsx
"use client";
import { useT } from "@/i18n/provider";
import { evalDict } from "@/i18n/dictionaries/eval";
import type { EvalDashboard } from "@/lib/eval-stats";

export function RunList({ runs }: { runs: EvalDashboard["runs"] }) {
  const t = useT(evalDict);
  return (
    <div className="chart-card overflow-x-auto">
      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("eval.runs")}</h3>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-neutral-400">
            <th className="py-1 pr-2">{t("eval.col.date")}</th>
            <th className="px-2 py-1">{t("eval.col.label")}</th>
            <th className="px-2 py-1">{t("eval.col.model")}</th>
            <th className="px-2 py-1">{t("eval.col.overall")}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1 pr-2">{r.ranAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              <td className="px-2 py-1">{r.label ?? "—"}</td>
              <td className="px-2 py-1">{r.model}</td>
              <td className="px-2 py-1 font-medium">{r.overallPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/eval/HeadlineCard.tsx src/components/eval/LatestTable.tsx src/components/eval/RunList.tsx
git commit -m "feat(eval): headline + latest table + run list components"
```

---

### Task 8: EvalClient + `/eval` page + verify

**Files:**
- Create: `src/components/eval/EvalClient.tsx`, `src/app/eval/page.tsx`

- [ ] **Step 1: `EvalClient.tsx`** (composes the pieces; empty-state)

```tsx
"use client";
import { useT } from "@/i18n/provider";
import { evalDict } from "@/i18n/dictionaries/eval";
import type { EvalDashboard } from "@/lib/eval-stats";
import { HeadlineCard } from "./HeadlineCard";
import { TrendChart } from "./TrendChart";
import { LatestTable } from "./LatestTable";
import { RunList } from "./RunList";

export function EvalClient({ dashboard }: { dashboard: EvalDashboard }) {
  const t = useT(evalDict);
  if (!dashboard.headline) {
    return <div className="p-6"><p className="text-sm text-neutral-500">{t("eval.empty")}</p></div>;
  }
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold">{t("eval.title")}</h1>
        <p className="text-sm text-neutral-500">{t("eval.subtitle")}</p>
      </div>
      <HeadlineCard headline={dashboard.headline} />
      <TrendChart trend={dashboard.trend} />
      {dashboard.latest && <LatestTable latest={dashboard.latest} />}
      <RunList runs={dashboard.runs} />
    </div>
  );
}
```

- [ ] **Step 2: `src/app/eval/page.tsx`** (server component — follows `agents/page.tsx`)

```tsx
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { evalRuns } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { buildEvalDashboard } from "@/lib/eval-stats";
import { EvalClient } from "@/components/eval/EvalClient";

export const dynamic = "force-dynamic";

export default async function EvalPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const rows = await db.select().from(evalRuns).orderBy(desc(evalRuns.ranAt)).limit(50);
  const dashboard = buildEvalDashboard(rows);

  return (
    <div>
      <AppHeader current="/eval" role={session.user.role} />
      <EvalClient dashboard={dashboard} />
    </div>
  );
}
```

- [ ] **Step 3: Verify full suite + typecheck**

Run: `npm test` then `npx tsc --noEmit`
Expected: `npm test` green (all prior + eval-stats + report aggregateDims + persist-run + TrendChart tests added); tsc exit 0. `/eval` page + components are not unit-tested (covered by the pure eval-stats/trendLines tests + manual host verify).

- [ ] **Step 4: Commit**

```bash
git add src/components/eval/EvalClient.tsx src/app/eval/page.tsx
git commit -m "feat(eval): /eval page (headline + trend + latest + runs)"
```

- [ ] **Step 5 (HOST, user): end-to-end verify**

1. Apply migration 0004 (Task 1 Step 4) if not done.
2. `npm run eval` (optionally `EVAL_LABEL="baseline"` then run again with `EVAL_LABEL="step2"`) → persists ≥2 rows.
3. Open `/eval` (logged in) → headline % + ▲/▼, trend chart with ≥2 points per line, latest scorecard table, run list. write-intent note visible.
Expected: data matches the scorecards in `.serena/qa/`.

---

## Self-Review

**1. Spec coverage:**
- Table `eval_run` + migration 0004 → Task 1 ✓
- Persist best-effort + label/gitSha → Task 3 ✓ · `dims` denormalized (D4) → buildEvalRow/aggregateDims ✓
- eval-stats (headline overallPct D1, delta, trend ASC, latest, runs) → Task 4 ✓
- Page (headline/trend/latest/runs) + i18n + nav + auth → Tasks 5-8 ✓
- write-intent honesty note (§7) → eval.writeNote in dict + LatestTable ✓
- Tests for stats logic ("eval-of-the-eval") → Tasks 2,3,4,6 ✓
- Non-goals respected: no PDF/drill-down/model-compare/public view ✓

**2. Placeholder scan:** No TBD/TODO. Task 5 Step 3 (bottom-nav) says "read the file to match its shape" — that's a deliberate match-existing-pattern instruction (its exact array shape isn't known here), not a placeholder; the entry to add is given explicitly.

**3. Type consistency:** `EvalRun`/`EvalScenarioScore`/`EvalDims` (Task 1) used identically in persist-run (Task 3), eval-stats (Task 4), components (Tasks 6-8). `EvalDashboard`/`TrendPoint` (Task 4) consumed by TrendChart/HeadlineCard/LatestTable/RunList/EvalClient with matching shapes. `aggregateDims` (Task 2) reused by buildEvalRow (Task 3). `overallOf`/`buildEvalDashboard`/`trendLines` signatures match their tests. DIMS order identical across report.ts, eval-stats.ts, LatestTable.tsx.
