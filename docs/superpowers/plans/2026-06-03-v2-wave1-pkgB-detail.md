# V2 Wave 1 — Package W1-B (Session detail: tool waterfall + sub-agent detail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gantt-style tool-call waterfall and a sub-agent detail section to the v2 session-detail page, reusing the row data the page already loads.

**Architecture:** A small client component `ToolWaterfall` renders horizontal bars whose widths are proportional to each call's `durationMs` relative to the max in the set (NOT absolute timeline positioning — the locked interface only provides `{name, durationMs, isError}`, no start/end). The bar-width math is a pure exported helper, unit-tested. The server component `[id]/page.tsx` replaces its "Tool calls gần đây" list with `<ToolWaterfall/>` and adds a "Sub-agents" section reading `s.subAgents` (already on the row).

**Tech Stack:** Next.js 16 client component, plain CSS-bar layout (no chart lib), vitest + RTL + jsdom (Wave 0 harness). Vietnamese strings hardcoded to match the existing page's convention (no `I18nProvider` is mounted anywhere in `app/`, so `useT` would throw; values mirror the `session.*` dictionary).

---

## Decisions / deviations (Rule 1, Rule 7 — surfaced)

1. **No absolute timeline.** v1 `session.js` positions bars by `start`/`end` on a shared time axis. The LOCKED `ToolWaterfall` prop is `{name, durationMs, isError?}[]` — no start/end. So bars are left-aligned and width = `durationMs / maxDuration`. This is the "relative to the max in the set" spec the lead gave. Bars are NOT a true Gantt with offsets; the visual is a proportional-duration bar chart.
2. **i18n: hardcoded Vietnamese, not `useT`.** The detail page is a server component and NO `I18nProvider` is mounted in `app/` (verified). The existing page hardcodes "Trạng thái", "Tool calls gần đây", etc. `useT` throws without a provider, so wiring it would break the page. Conformant + surgical choice (Rule 3/11): hardcode Vietnamese mirroring `session.*` dict values (`wfTitle`="Tool-call waterfall", `subs`="Sub-agents ({n})", `subNoDesc`="(không mô tả)", `noToolCall`). Flag for the lead: if a provider is added later, swap to `useT`.
3. **Bar color.** error → red (`bg-red-500`); else accent (`var(--color-accent)`), matching v1 `statusColor` minus the running case (detail page tool calls are completed).

---

## File Structure

- Create: `v2/src/components/agents/ToolWaterfall.tsx` — client component + pure `barWidthPct` helper.
- Create: `v2/src/components/agents/ToolWaterfall.test.tsx` — unit tests for `barWidthPct` + smoke render tests.
- Modify: `v2/src/app/agents/[id]/page.tsx` — swap tool-call list for `<ToolWaterfall/>`; add Sub-agents section. Keep timeline + meta intact.

---

## Task 1: `barWidthPct` pure helper + `ToolWaterfall` component

**Files:**
- Create: `v2/src/components/agents/ToolWaterfall.tsx`
- Test: `v2/src/components/agents/ToolWaterfall.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { barWidthPct, ToolWaterfall } from "./ToolWaterfall";

describe("barWidthPct (pure)", () => {
  it("scales each duration relative to the max in the set", () => {
    expect(barWidthPct(50, 100)).toBe(50);
    expect(barWidthPct(100, 100)).toBe(100);
    expect(barWidthPct(25, 100)).toBe(25);
  });

  it("clamps a minimum visible width so tiny/zero bars still show", () => {
    expect(barWidthPct(0, 100)).toBe(2);
    expect(barWidthPct(1, 100000)).toBe(2);
  });

  it("treats null duration as zero (minimum width)", () => {
    expect(barWidthPct(null, 100)).toBe(2);
  });

  it("returns full width when max is 0 or missing (avoid divide-by-zero)", () => {
    expect(barWidthPct(0, 0)).toBe(2);
    expect(barWidthPct(10, 0)).toBe(100);
  });
});

describe("ToolWaterfall (component)", () => {
  const calls = [
    { name: "Read", durationMs: 200 },
    { name: "Bash", durationMs: 1000, isError: true },
    { name: "Edit", durationMs: null },
  ];

  it("renders a row per call with the tool name", () => {
    const { getByText } = render(<ToolWaterfall calls={calls} />);
    expect(getByText("Read")).toBeTruthy();
    expect(getByText("Bash")).toBeTruthy();
    expect(getByText("Edit")).toBeTruthy();
  });

  it("renders the largest bar at 100% width and scales the rest", () => {
    const { container } = render(<ToolWaterfall calls={calls} />);
    const bars = container.querySelectorAll<HTMLElement>("[data-wf-bar]");
    expect(bars).toHaveLength(3);
    // Bash is the max (1000) → 100%; Read 200 → 20%; Edit null → clamp 2%
    expect(bars[0].style.width).toBe("20%");
    expect(bars[1].style.width).toBe("100%");
    expect(bars[2].style.width).toBe("2%");
  });

  it("marks error bars with a data attribute for red styling", () => {
    const { container } = render(<ToolWaterfall calls={calls} />);
    const bars = container.querySelectorAll<HTMLElement>("[data-wf-bar]");
    expect(bars[1].getAttribute("data-error")).toBe("true");
    expect(bars[0].getAttribute("data-error")).toBe("false");
  });

  it("renders an empty-state message when there are no calls", () => {
    const { container } = render(<ToolWaterfall calls={[]} />);
    expect(container.textContent).toMatch(/chưa có tool call/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/components/agents/ToolWaterfall`
Expected: FAIL — `barWidthPct`/`ToolWaterfall` not exported (module not found).

- [ ] **Step 3: Write minimal implementation**

```tsx
"use client";

// LAAM v2 — Tool-call waterfall: horizontal bars whose width is proportional
// to each call's duration relative to the longest call in the set. No absolute
// timeline (the input carries no start/end), so bars are left-aligned.

const MIN_PCT = 2; // keep zero/tiny bars visible

export type WaterfallCall = {
  name: string;
  durationMs: number | null;
  isError?: boolean;
};

/** Bar width in % of the longest call. Pure — unit-tested. */
export function barWidthPct(durationMs: number | null, maxMs: number): number {
  const d = durationMs && durationMs > 0 ? durationMs : 0;
  if (!maxMs || maxMs <= 0) return d > 0 ? 100 : MIN_PCT;
  return Math.max(MIN_PCT, Math.round((d / maxMs) * 100));
}

function fmtDur(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${Math.round(ms / 100) / 10}s`;
}

export function ToolWaterfall({ calls }: { calls: WaterfallCall[] }) {
  if (!calls.length) {
    return (
      <p className="text-sm text-neutral-500">Phiên này chưa có tool call.</p>
    );
  }
  const maxMs = Math.max(0, ...calls.map((c) => c.durationMs ?? 0));
  return (
    <div className="space-y-1">
      {calls.map((c, i) => {
        const isError = c.isError === true;
        return (
          <div
            key={i}
            className="grid grid-cols-[minmax(8rem,14rem)_1fr] items-center gap-3 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs dark:border-neutral-800"
          >
            <span className="truncate font-mono font-semibold text-[var(--color-accent)]">
              {c.name}
            </span>
            <div className="relative h-4 rounded bg-neutral-100 dark:bg-neutral-800">
              <div
                data-wf-bar
                data-error={isError}
                className={
                  "absolute inset-y-0 left-0 flex items-center justify-end rounded pr-1 " +
                  (isError ? "bg-red-500" : "bg-[var(--color-accent)]")
                }
                style={{ width: `${barWidthPct(c.durationMs, maxMs)}%` }}
                title={`${c.name} · ${fmtDur(c.durationMs)}${isError ? " · error" : ""}`}
              >
                <span className="text-[10px] font-semibold tabular-nums text-white">
                  {fmtDur(c.durationMs)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/components/agents/ToolWaterfall`
Expected: PASS (all suites green).
If a jsdom phantom failure appears: `rm -rf v2/node_modules/.vite v2/node_modules/.vitest` and re-run.

- [ ] **Step 5: (no commit — lead reviews uncommitted)**

---

## Task 2: Wire `ToolWaterfall` + Sub-agents into `[id]/page.tsx`

**Files:**
- Modify: `v2/src/app/agents/[id]/page.tsx`

- [ ] **Step 1: Import the component**

Add after the existing imports (around line 9):

```tsx
import { ToolWaterfall } from "@/components/agents/ToolWaterfall";
import type { SubAgentJson } from "@/db/schema";
```

- [ ] **Step 2: Replace the "Tool calls gần đây" list section**

Replace the whole `{toolCalls.length > 0 && (...)}` block (current lines 90-113) with:

```tsx
        {toolCalls.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold">
              Tool-call waterfall{" "}
              <span className="text-neutral-400">{toolCalls.length}</span>
            </h2>
            <ToolWaterfall
              calls={toolCalls.map((t) => ({
                name: t.name,
                durationMs: t.durationMs ?? null,
                isError: t.isError,
              }))}
            />
          </section>
        )}
```

- [ ] **Step 3: Add the Sub-agents section**

Insert directly AFTER the waterfall section (before the Timeline `<section>`), using `s.subAgents` from the row:

```tsx
        {s.subAgents && s.subAgents.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold">
              Sub-agents{" "}
              <span className="text-neutral-400">{s.subAgents.length}</span>
            </h2>
            <ul className="space-y-1">
              {(s.subAgents as SubAgentJson[]).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs dark:border-neutral-800"
                >
                  <span
                    className={
                      "inline-block h-2 w-2 shrink-0 rounded-full " +
                      (a.status === "running"
                        ? "bg-green-500"
                        : "bg-neutral-400")
                    }
                  />
                  <span className="font-mono font-semibold text-[var(--color-accent)]">
                    {a.type}
                  </span>
                  <span className="flex-1 truncate text-neutral-500">
                    {a.description || "(không mô tả)"}
                  </span>
                  <span className="tabular-nums text-neutral-400">
                    {a.durationMs != null
                      ? Math.round(a.durationMs / 100) / 10 + "s"
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
```

- [ ] **Step 4: Type-check / build sanity**

Run: `cd v2 && npx tsc --noEmit` (verify ToolWaterfall + page typecheck).
Expected: no new errors in the two touched files.
Note: full `next build` may be run by the lead during integration; if it can't run in-sandbox, report that as a verification gap (Rule 12).

- [ ] **Step 5: Re-run own tests**

Run: `cd v2 && npx vitest run src/components/agents/ToolWaterfall`
Expected: PASS.

---

## Success criteria

- `cd v2 && npx vitest run src/components/agents/ToolWaterfall` green.
- `/agents/[id]` shows a tool-call waterfall (bars proportional to duration, errors red) and a sub-agent detail list (type · description · duration · status dot) when `s.subAgents` present.
- Timeline + meta sections unchanged.
- `barWidthPct` is pure and unit-tested (scaling, min-clamp, null, divide-by-zero).

## Self-review notes

- Spec coverage: waterfall ✅ (Task 1), pure tested width math ✅ (Task 1 Step 1/3), error bars red ✅, sub-agent section ✅ (Task 2 Step 3), timeline+meta intact ✅ (untouched). 
- Type consistency: `barWidthPct(durationMs, maxMs)` and `WaterfallCall` used identically in test + impl + page mapping. `SubAgentJson` fields (id/type/description/status/durationMs) match schema.ts:181.
- No placeholders.
