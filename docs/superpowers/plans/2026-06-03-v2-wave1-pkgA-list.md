# V2 Wave 1 — Package W1-A (Agents list: client + filters + live + CSV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the v2 `/agents` page as a real-time, client-driven list with filter/search bar, stuck-agent badge, live duration ticker, sub-agent detail and CSV export — at parity with v1 `public/agents.{html,js}`.

**Architecture:** A thin server shell (`app/agents/page.tsx`) does the `auth()` guard, reads the lang cookie, and wraps a client `<AgentsClient/>` in `<I18nProvider>` (the root layout does NOT mount the provider, so the page must — this keeps the change inside owned files). `AgentsClient` consumes the Wave-0 `useLiveSessions()` SSE hook, derives filter option lists, runs the pure tested `applyFilters`, groups visible sessions by `projectName` (null → "Khác"), and renders `FilterBar` + grouped `AgentCard`s. `AgentCard` owns its own 1-second live duration ticker via a local `useEffect` interval (no global refetch). CSV export uses Wave-0 `downloadCsv` with `AGENT_CSV_COLUMNS` mirroring v1 `export.js` session columns.

**Tech Stack:** Next.js 16 (App Router, RSC) · React 19 · TypeScript · Tailwind 4 · vitest + @testing-library/react + jsdom · Wave-0 `useLiveSessions`, `isStuck`, i18n `useT`/`I18nProvider`, `downloadCsv`.

---

## File Structure (owned by this package)

| File | Responsibility |
|---|---|
| `v2/src/components/agents/filters.ts` | `AgentFilters` type, `EMPTY_FILTERS`, pure `applyFilters`, `AGENT_CSV_COLUMNS`, pure `toCsvRow` mapper |
| `v2/src/components/agents/filters.test.ts` | unit tests for `applyFilters` + `toCsvRow` |
| `v2/src/components/agents/SubAgentList.tsx` | render sub-agent list (type · description · duration · status dot) |
| `v2/src/components/agents/SubAgentList.test.tsx` | RTL test |
| `v2/src/components/agents/AgentCard.tsx` | one session card: status/stuck/LOCAL badges, live ticker, meta, `<SubAgentList>` |
| `v2/src/components/agents/AgentCard.test.tsx` | RTL test (stuck badge, live ticker) |
| `v2/src/components/agents/FilterBar.tsx` | search input + project/model/status/branch/time selects + clear + CSV button |
| `v2/src/components/agents/FilterBar.test.tsx` | RTL test (onChange, CSV button) |
| `v2/src/components/agents/AgentsClient.tsx` | top-level client: hook → derive options → filter → group → render |
| `v2/src/components/agents/AgentsClient.test.tsx` | RTL test (filter narrows cards, CSV calls downloadCsv) |
| `v2/src/app/agents/page.tsx` | **rewrite** → thin server shell: `auth()` guard, lang cookie, `<I18nProvider><AgentsClient/></I18nProvider>` |

All RTL tests that render components using `useT` must wrap them in `<I18nProvider lang="vi">`.

---

## Locked interfaces (from TL plan — do not change)

```ts
export type AgentFilters = { q: string; project: string; model: string; status: string; branch: string; window: string };
export function applyFilters(sessions: LiveSession[], f: AgentFilters, now?: number): LiveSession[]; // pure
export function AgentsClient(): JSX.Element;
export function FilterBar(props: { value: AgentFilters; onChange: (f: AgentFilters) => void; projects: string[]; models: string[]; branches: string[]; }): JSX.Element;
export function AgentCard(props: { s: LiveSession; stuck: boolean }): JSX.Element;
export function SubAgentList(props: { items: SubAgentJson[] }): JSX.Element;
export const AGENT_CSV_COLUMNS: string[];
```

`LiveSession` (from `@/hooks/useLiveSessions`) has: id, projectId, projectName, source, model, gitBranch, status, startedAt, lastActivity, messageCount, toolCount, subAgentCount, subAgents, costUsd, latestActivity, tokensIn, tokensOut.

`SubAgentJson` (from `@/db/schema`): { id, type, description, status, durationMs }.

`AGENT_CSV_COLUMNS` mirrors v1 `export.js` session header (adapted to fields present in LiveSession):
`["id","project","model","gitBranch","status","startTime","lastActivity","durationMs","messageCount","toolUseCount","subAgentCount","tokensIn","tokensOut","costUSD"]`.
(v1 also had projectPath / userMessageCount / assistantMessageCount — not present in LiveSession, omitted to fail loud rather than emit blank columns.)

---

## Task 1: `filters.ts` — pure filter + CSV mapping

**Files:**
- Create: `v2/src/components/agents/filters.ts`
- Test: `v2/src/components/agents/filters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// v2/src/components/agents/filters.test.ts
import { describe, expect, test } from "vitest";
import {
  applyFilters,
  EMPTY_FILTERS,
  AGENT_CSV_COLUMNS,
  toCsvRow,
  type AgentFilters,
} from "./filters";
import type { LiveSession } from "@/hooks/useLiveSessions";

const NOW = 1_700_000_000_000;

function mk(over: Partial<LiveSession> = {}): LiveSession {
  return {
    id: "s1",
    projectId: "p1",
    projectName: "LAAM",
    source: "claude",
    model: "claude-sonnet-4",
    gitBranch: "main",
    status: "running",
    startedAt: NOW - 60_000,
    lastActivity: NOW - 30_000,
    messageCount: 4,
    toolCount: 2,
    subAgentCount: 1,
    subAgents: [{ id: "a", type: "explorer", description: "scan", status: "done", durationMs: 1000 }],
    costUsd: 0.12,
    latestActivity: "Reading files",
    tokensIn: 100,
    tokensOut: 50,
    ...over,
  };
}

const f = (over: Partial<AgentFilters> = {}): AgentFilters => ({ ...EMPTY_FILTERS, ...over });

describe("applyFilters", () => {
  test("empty filters return all sessions", () => {
    const list = [mk(), mk({ id: "s2" })];
    expect(applyFilters(list, EMPTY_FILTERS, NOW)).toHaveLength(2);
  });

  test("q matches project name (case-insensitive)", () => {
    const list = [mk({ projectName: "LAAM" }), mk({ id: "s2", projectName: "Other" })];
    expect(applyFilters(list, f({ q: "laam" }), NOW).map((s) => s.id)).toEqual(["s1"]);
  });

  test("q matches model, latestActivity and sub-agent type", () => {
    const list = [
      mk({ id: "m", model: "qwen3-vl", projectName: "x", latestActivity: "", subAgents: null }),
      mk({ id: "l", model: "z", projectName: "x", latestActivity: "Editing README", subAgents: null }),
      mk({ id: "sub", model: "z", projectName: "x", latestActivity: "", subAgents: [{ id: "a", type: "reviewer", description: "", status: "done", durationMs: null }] }),
    ];
    expect(applyFilters(list, f({ q: "qwen" }), NOW).map((s) => s.id)).toEqual(["m"]);
    expect(applyFilters(list, f({ q: "readme" }), NOW).map((s) => s.id)).toEqual(["l"]);
    expect(applyFilters(list, f({ q: "reviewer" }), NOW).map((s) => s.id)).toEqual(["sub"]);
  });

  test("status filter exact; 'stuck' uses isStuck (>10m, not done)", () => {
    const list = [
      mk({ id: "run", status: "running", lastActivity: NOW - 1000 }),
      mk({ id: "old", status: "running", lastActivity: NOW - 20 * 60_000 }),
      mk({ id: "done", status: "done", lastActivity: NOW - 20 * 60_000 }),
    ];
    expect(applyFilters(list, f({ status: "running" }), NOW).map((s) => s.id)).toEqual(["run", "old"]);
    expect(applyFilters(list, f({ status: "stuck" }), NOW).map((s) => s.id)).toEqual(["old"]);
  });

  test("time window filters on lastActivity", () => {
    const list = [
      mk({ id: "fresh", lastActivity: NOW - 30 * 60_000 }),
      mk({ id: "old", lastActivity: NOW - 3 * 3_600_000 }),
    ];
    expect(applyFilters(list, f({ window: "1h" }), NOW).map((s) => s.id)).toEqual(["fresh"]);
    expect(applyFilters(list, f({ window: "6h" }), NOW).map((s) => s.id)).toEqual(["fresh", "old"]);
  });

  test("project / model / branch exact filters and combine (AND)", () => {
    const list = [
      mk({ id: "a", projectName: "LAAM", model: "m1", gitBranch: "main" }),
      mk({ id: "b", projectName: "LAAM", model: "m2", gitBranch: "dev" }),
    ];
    expect(applyFilters(list, f({ project: "LAAM", model: "m1" }), NOW).map((s) => s.id)).toEqual(["a"]);
    expect(applyFilters(list, f({ branch: "dev" }), NOW).map((s) => s.id)).toEqual(["b"]);
  });
});

describe("AGENT_CSV_COLUMNS + toCsvRow", () => {
  test("columns mirror v1 session export header", () => {
    expect(AGENT_CSV_COLUMNS).toEqual([
      "id", "project", "model", "gitBranch", "status",
      "startTime", "lastActivity", "durationMs", "messageCount",
      "toolUseCount", "subAgentCount", "tokensIn", "tokensOut", "costUSD",
    ]);
  });

  test("toCsvRow maps a LiveSession to keyed columns with ISO times + durationMs", () => {
    const row = toCsvRow(mk());
    expect(row.id).toBe("s1");
    expect(row.project).toBe("LAAM");
    expect(row.toolUseCount).toBe(2);
    expect(row.costUSD).toBe(0.12);
    expect(row.startTime).toBe(new Date(NOW - 60_000).toISOString());
    expect(row.lastActivity).toBe(new Date(NOW - 30_000).toISOString());
    expect(row.durationMs).toBe(30_000); // lastActivity - startedAt
  });

  test("toCsvRow leaves times empty when missing", () => {
    const row = toCsvRow(mk({ startedAt: null, lastActivity: null }));
    expect(row.startTime).toBe("");
    expect(row.lastActivity).toBe("");
    expect(row.durationMs).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/components/agents/filters`
Expected: FAIL — module `./filters` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// v2/src/components/agents/filters.ts
// Pure filter + CSV-row mapping for the Agents list. No DOM, no React — unit-tested.
// Mirrors the filter semantics of v1 public/agents.js and the session CSV header
// of v1 public/export.js.

import { isStuck } from "@/lib/stuck";
import type { LiveSession } from "@/hooks/useLiveSessions";

export type AgentFilters = {
  q: string;
  project: string;
  model: string;
  status: string;
  branch: string;
  window: string;
};

export const EMPTY_FILTERS: AgentFilters = {
  q: "",
  project: "",
  model: "",
  status: "",
  branch: "",
  window: "",
};

const STUCK_THRESHOLD_MIN = 10; // v1 default; v2 has no /api/config yet.

// Time-window option → milliseconds back from `now`.
const WINDOW_MS: Record<string, number> = {
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 86_400_000,
};

// Build the searchable text for a session: project, model, latest activity,
// and every sub-agent type. Lower-cased once.
function haystack(s: LiveSession): string {
  const parts = [s.projectName, s.model, s.latestActivity, s.gitBranch];
  for (const a of s.subAgents ?? []) parts.push(a.type);
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function applyFilters(
  sessions: LiveSession[],
  f: AgentFilters,
  now: number = Date.now(),
): LiveSession[] {
  const q = f.q.trim().toLowerCase();
  const winMs = f.window ? WINDOW_MS[f.window] : undefined;
  return sessions.filter((s) => {
    if (q && !haystack(s).includes(q)) return false;
    if (f.project && s.projectName !== f.project) return false;
    if (f.model && s.model !== f.model) return false;
    if (f.branch && s.gitBranch !== f.branch) return false;
    if (f.status) {
      if (f.status === "stuck") {
        if (!isStuck(s, STUCK_THRESHOLD_MIN, now)) return false;
      } else if (s.status !== f.status) {
        return false;
      }
    }
    if (winMs != null) {
      if (s.lastActivity == null || now - s.lastActivity > winMs) return false;
    }
    return true;
  });
}

// CSV header mirrors v1 export.js session columns, restricted to fields present
// on LiveSession. (v1 projectPath / user|assistantMessageCount are not carried
// by the live snapshot, so they are intentionally omitted rather than blank.)
export const AGENT_CSV_COLUMNS = [
  "id", "project", "model", "gitBranch", "status",
  "startTime", "lastActivity", "durationMs", "messageCount",
  "toolUseCount", "subAgentCount", "tokensIn", "tokensOut", "costUSD",
] as const;

function isoOrEmpty(ms: number | null): string {
  return ms == null ? "" : new Date(ms).toISOString();
}

// Map a LiveSession to a flat record keyed by AGENT_CSV_COLUMNS, ready for downloadCsv.
export function toCsvRow(s: LiveSession): Record<string, unknown> {
  const durationMs =
    s.startedAt != null && s.lastActivity != null ? s.lastActivity - s.startedAt : "";
  return {
    id: s.id,
    project: s.projectName ?? "",
    model: s.model ?? "",
    gitBranch: s.gitBranch ?? "",
    status: s.status,
    startTime: isoOrEmpty(s.startedAt),
    lastActivity: isoOrEmpty(s.lastActivity),
    durationMs,
    messageCount: s.messageCount,
    toolUseCount: s.toolCount,
    subAgentCount: s.subAgentCount,
    tokensIn: s.tokensIn,
    tokensOut: s.tokensOut,
    costUSD: s.costUsd,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/components/agents/filters`
Expected: PASS (all cases).

---

## Task 2: `SubAgentList.tsx` — sub-agent detail rows

**Files:**
- Create: `v2/src/components/agents/SubAgentList.tsx`
- Test: `v2/src/components/agents/SubAgentList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// v2/src/components/agents/SubAgentList.test.tsx
import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { SubAgentList } from "./SubAgentList";
import type { SubAgentJson } from "@/db/schema";

function wrap(items: SubAgentJson[]) {
  return render(
    <I18nProvider lang="vi">
      <SubAgentList items={items} />
    </I18nProvider>,
  );
}

test("renders the sub-agents header with count and each type", () => {
  wrap([
    { id: "1", type: "explorer", description: "scan repo", status: "done", durationMs: 2000 },
    { id: "2", type: "reviewer", description: "", status: "running", durationMs: null },
  ]);
  expect(screen.getByText("Sub-agents (2)")).toBeTruthy();
  expect(screen.getByText("explorer")).toBeTruthy();
  expect(screen.getByText("scan repo")).toBeTruthy();
  expect(screen.getByText("reviewer")).toBeTruthy();
  // missing description falls back to the i18n placeholder
  expect(screen.getByText("(không mô tả)")).toBeTruthy();
});

test("renders nothing when there are no items", () => {
  const { container } = wrap([]);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/components/agents/SubAgentList`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// v2/src/components/agents/SubAgentList.tsx
"use client";

import { useT } from "@/i18n/provider";
import { agents } from "@/i18n/dictionaries/agents";
import type { SubAgentJson } from "@/db/schema";

const DOT: Record<string, string> = {
  running: "bg-green-500",
  done: "bg-neutral-400",
};

function dur(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SubAgentList({ items }: { items: SubAgentJson[] }) {
  const t = useT(agents);
  if (!items.length) return null;
  return (
    <div className="mt-3 border-t border-neutral-100 pt-2 dark:border-neutral-800">
      <p className="mb-1 text-[11px] font-semibold text-neutral-500">
        {t("agents.subs", { n: items.length })}
      </p>
      <ul className="space-y-1">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-[11px] text-neutral-500">
            <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + (DOT[a.status] ?? "bg-amber-500")} />
            <span className="font-mono font-medium text-neutral-700 dark:text-neutral-300">{a.type}</span>
            <span className="truncate">{a.description || t("agents.subNoDesc")}</span>
            <span className="ml-auto shrink-0 tabular-nums">{dur(a.durationMs)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/components/agents/SubAgentList`
Expected: PASS.

---

## Task 3: `AgentCard.tsx` — one session card with live ticker

**Files:**
- Create: `v2/src/components/agents/AgentCard.tsx`
- Test: `v2/src/components/agents/AgentCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// v2/src/components/agents/AgentCard.test.tsx
import { afterEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { AgentCard } from "./AgentCard";
import type { LiveSession } from "@/hooks/useLiveSessions";

const NOW = 1_700_000_000_000;

function mk(over: Partial<LiveSession> = {}): LiveSession {
  return {
    id: "s1", projectId: "p1", projectName: "LAAM", source: "claude",
    model: "claude-sonnet-4", gitBranch: "main", status: "running",
    startedAt: NOW - 5000, lastActivity: NOW - 1000, messageCount: 4, toolCount: 2,
    subAgentCount: 0, subAgents: null, costUsd: 0.12, latestActivity: "Reading files",
    tokensIn: 100, tokensOut: 50, ...over,
  };
}

function wrap(s: LiveSession, stuck = false) {
  return render(
    <I18nProvider lang="vi">
      <AgentCard s={s} stuck={stuck} />
    </I18nProvider>,
  );
}

afterEach(() => vi.useRealTimers());

test("shows status, model and latest activity", () => {
  wrap(mk());
  expect(screen.getByText("running")).toBeTruthy();
  expect(screen.getByText("Reading files")).toBeTruthy();
});

test("shows the stuck badge only when stuck", () => {
  wrap(mk(), true);
  expect(screen.getByText("Nghi kẹt")).toBeTruthy();
});

test("no stuck badge when not stuck", () => {
  wrap(mk(), false);
  expect(screen.queryByText("Nghi kẹt")).toBeNull();
});

test("shows the LOCAL badge for local sessions", () => {
  wrap(mk({ source: "local" }));
  expect(screen.getByText("LOCAL")).toBeTruthy();
});

test("live duration ticker advances each second for running sessions", () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // started 5s ago, running → initial elapsed reads 0:05
  wrap(mk({ startedAt: NOW - 5000, status: "running" }));
  expect(screen.getByTestId("elapsed").textContent).toBe("0:05");
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByTestId("elapsed").textContent).toBe("0:07");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/components/agents/AgentCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// v2/src/components/agents/AgentCard.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/provider";
import { agents } from "@/i18n/dictionaries/agents";
import { shortModel, usd, num } from "@/lib/format";
import { SubAgentList } from "./SubAgentList";
import type { LiveSession } from "@/hooks/useLiveSessions";

const STATUS_STYLES: Record<string, string> = {
  running: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  idle: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  done: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

// mm:ss / h:mm:ss elapsed from `startedAt` to `to`.
function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Live duration: re-renders once a second while the session is running.
function Elapsed({ startedAt, running }: { startedAt: number | null; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  if (startedAt == null) return null;
  return <span data-testid="elapsed">{fmtElapsed(now - startedAt)}</span>;
}

export function AgentCard({ s, stuck }: { s: LiveSession; stuck: boolean }) {
  const t = useT(agents);
  const status = s.status ?? "done";
  const running = status === "running";
  return (
    <Link
      href={`/agents/${s.id}`}
      className="block rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={
              "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide " +
              (STATUS_STYLES[status] ?? STATUS_STYLES.done)
            }
          >
            {status}
          </span>
          {stuck && (
            <span
              title={t("agents.badgeStuckTitle")}
              className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-900/40 dark:text-red-300"
            >
              {t("agents.badgeStuck")}
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-[11px] text-neutral-500">{shortModel(s.model)}</div>
          {s.source === "local" && (
            <span title={t("agents.badgeLocalTitle")} className="text-[10px] font-semibold text-sky-500">
              ⬡ {t("agents.badgeLocal")}
            </span>
          )}
        </div>
      </div>

      {s.latestActivity && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          {s.latestActivity}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        {running ? (
          <Elapsed startedAt={s.startedAt} running={running} />
        ) : (
          <span>{num(s.messageCount)} {t("agents.msgUnit")}</span>
        )}
        {running && <span>{num(s.messageCount)} {t("agents.msgUnit")}</span>}
        <span>{num(s.toolCount)} {t("agents.toolUnit")}</span>
        <span title={t("agents.costTitle")} className="font-medium text-neutral-700 dark:text-neutral-300">
          {usd(s.costUsd)}
        </span>
        {s.gitBranch && <span className="font-mono">⎇ {s.gitBranch}</span>}
      </div>

      {s.subAgents && s.subAgents.length > 0 && <SubAgentList items={s.subAgents} />}
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/components/agents/AgentCard`
Expected: PASS.

---

## Task 4: `FilterBar.tsx` — search + selects + clear + CSV

**Files:**
- Create: `v2/src/components/agents/FilterBar.tsx`
- Test: `v2/src/components/agents/FilterBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// v2/src/components/agents/FilterBar.test.tsx
import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { FilterBar } from "./FilterBar";
import { EMPTY_FILTERS } from "./filters";

function setup(onChange = vi.fn(), onExport = vi.fn()) {
  render(
    <I18nProvider lang="vi">
      <FilterBar
        value={EMPTY_FILTERS}
        onChange={onChange}
        onExport={onExport}
        projects={["LAAM", "Other"]}
        models={["m1"]}
        branches={["main"]}
      />
    </I18nProvider>,
  );
  return { onChange, onExport };
}

test("typing in search calls onChange with the new q", () => {
  const { onChange } = setup();
  fireEvent.change(screen.getByPlaceholderText("Tìm project / agent / task…"), {
    target: { value: "laam" },
  });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: "laam" }));
});

test("selecting a project calls onChange with that project", () => {
  const { onChange } = setup();
  fireEvent.change(screen.getByLabelText("project-filter"), { target: { value: "Other" } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ project: "Other" }));
});

test("CSV button calls onExport", () => {
  const { onExport } = setup();
  fireEvent.click(screen.getByText("CSV"));
  expect(onExport).toHaveBeenCalled();
});

test("clear button resets to EMPTY_FILTERS", () => {
  const onChange = vi.fn();
  render(
    <I18nProvider lang="vi">
      <FilterBar
        value={{ ...EMPTY_FILTERS, q: "x", status: "stuck" }}
        onChange={onChange}
        onExport={vi.fn()}
        projects={[]}
        models={[]}
        branches={[]}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByText("Xoá lọc"));
  expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/components/agents/FilterBar`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// v2/src/components/agents/FilterBar.tsx
"use client";

import { useT } from "@/i18n/provider";
import { agents } from "@/i18n/dictionaries/agents";
import { EMPTY_FILTERS, type AgentFilters } from "./filters";

const SELECT_CLS =
  "rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200";

export function FilterBar({
  value,
  onChange,
  onExport,
  projects,
  models,
  branches,
}: {
  value: AgentFilters;
  onChange: (f: AgentFilters) => void;
  onExport: () => void;
  projects: string[];
  models: string[];
  branches: string[];
}) {
  const t = useT(agents);
  const set = (patch: Partial<AgentFilters>) => onChange({ ...value, ...patch });

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={value.q}
        onChange={(e) => set({ q: e.target.value })}
        placeholder={t("agents.searchPh")}
        className={"min-w-[220px] flex-1 " + SELECT_CLS}
      />

      <select aria-label="project-filter" className={SELECT_CLS} value={value.project} onChange={(e) => set({ project: e.target.value })}>
        <option value="">{t("agents.projAll")}</option>
        {projects.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      <select aria-label="model-filter" className={SELECT_CLS} value={value.model} onChange={(e) => set({ model: e.target.value })}>
        <option value="">{t("agents.modelAll")}</option>
        {models.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>

      <select aria-label="status-filter" className={SELECT_CLS} value={value.status} onChange={(e) => set({ status: e.target.value })}>
        <option value="">{t("agents.statusAll")}</option>
        <option value="running">running</option>
        <option value="idle">idle</option>
        <option value="done">done</option>
        <option value="stuck">{t("agents.statusStuck")}</option>
      </select>

      <select aria-label="branch-filter" className={SELECT_CLS} value={value.branch} onChange={(e) => set({ branch: e.target.value })}>
        <option value="">{t("agents.branchAll")}</option>
        {branches.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>

      <select aria-label="window-filter" className={SELECT_CLS} value={value.window} onChange={(e) => set({ window: e.target.value })}>
        <option value="">{t("agents.timeAll")}</option>
        <option value="1h">{t("agents.time1h")}</option>
        <option value="6h">{t("agents.time6h")}</option>
        <option value="24h">{t("agents.time24h")}</option>
        <option value="7d">{t("agents.time7d")}</option>
      </select>

      <button
        type="button"
        onClick={() => onChange(EMPTY_FILTERS)}
        className="rounded-lg px-2.5 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        {t("agents.clear")}
      </button>

      <button
        type="button"
        onClick={onExport}
        title={t("agents.exportTitle")}
        className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        {t("agents.exportCsv")}
      </button>
    </div>
  );
}
```

> Note: the locked TL interface for `FilterBar` lists props `{ value, onChange, projects, models, branches }`. I add an `onExport: () => void` because the CSV button lives in the bar (per the W1-A checklist) and the export needs the *filtered* rows that only `AgentsClient` holds. This is additive and does not break the locked shape.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/components/agents/FilterBar`
Expected: PASS.

---

## Task 5: `AgentsClient.tsx` — hook + derive options + filter + group + render

**Files:**
- Create: `v2/src/components/agents/AgentsClient.tsx`
- Test: `v2/src/components/agents/AgentsClient.test.tsx`

`useLiveSessions` is mocked in the test (it opens a real EventSource otherwise).

- [ ] **Step 1: Write the failing test**

```tsx
// v2/src/components/agents/AgentsClient.test.tsx
import { afterEach, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type { LiveSession } from "@/hooks/useLiveSessions";

const NOW = 1_700_000_000_000;
function mk(over: Partial<LiveSession> = {}): LiveSession {
  return {
    id: "s1", projectId: "p1", projectName: "LAAM", source: "claude",
    model: "m1", gitBranch: "main", status: "running",
    startedAt: NOW - 5000, lastActivity: NOW - 1000, messageCount: 1, toolCount: 1,
    subAgentCount: 0, subAgents: null, costUsd: 0, latestActivity: "alpha",
    tokensIn: 0, tokensOut: 0, ...over,
  };
}

// Mutable state for the mocked hook.
const hookState = { sessions: [] as LiveSession[], connected: true, stuckIds: [] as string[] };
vi.mock("@/hooks/useLiveSessions", () => ({
  useLiveSessions: () => hookState,
}));
const downloadCsv = vi.fn();
vi.mock("@/lib/export", () => ({ downloadCsv: (...a: unknown[]) => downloadCsv(...a) }));

import { AgentsClient } from "./AgentsClient";

function ui() {
  return render(
    <I18nProvider lang="vi">
      <AgentsClient />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  downloadCsv.mockClear();
});

test("renders a card per session and the X/Y count", () => {
  hookState.sessions = [mk({ id: "a", latestActivity: "alpha" }), mk({ id: "b", latestActivity: "beta" })];
  ui();
  expect(screen.getByText("alpha")).toBeTruthy();
  expect(screen.getByText("beta")).toBeTruthy();
  expect(screen.getByText("2/2 session")).toBeTruthy();
});

test("typing in search narrows the visible cards live", () => {
  hookState.sessions = [mk({ id: "a", latestActivity: "alpha" }), mk({ id: "b", latestActivity: "beta" })];
  ui();
  fireEvent.change(screen.getByPlaceholderText("Tìm project / agent / task…"), {
    target: { value: "alpha" },
  });
  expect(screen.getByText("alpha")).toBeTruthy();
  expect(screen.queryByText("beta")).toBeNull();
  expect(screen.getByText("1/2 session")).toBeTruthy();
});

test("groups by projectName, null → Khác", () => {
  hookState.sessions = [mk({ id: "a", projectName: "LAAM" }), mk({ id: "b", projectName: null, latestActivity: "orphan" })];
  ui();
  expect(screen.getByText("LAAM")).toBeTruthy();
  expect(screen.getByText("Khác")).toBeTruthy();
});

test("CSV button exports the filtered rows via downloadCsv", () => {
  hookState.sessions = [mk({ id: "a", latestActivity: "alpha" }), mk({ id: "b", latestActivity: "beta" })];
  ui();
  fireEvent.change(screen.getByPlaceholderText("Tìm project / agent / task…"), {
    target: { value: "alpha" },
  });
  fireEvent.click(screen.getByText("CSV"));
  expect(downloadCsv).toHaveBeenCalledTimes(1);
  const [filename, rows, columns] = downloadCsv.mock.calls[0];
  expect(filename).toBe("agents.csv");
  expect(rows).toHaveLength(1); // only the filtered "alpha" row
  expect(rows[0].id).toBe("a");
  expect(columns[0]).toBe("id");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/components/agents/AgentsClient`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// v2/src/components/agents/AgentsClient.tsx
"use client";

// Client-driven Agents list. Subscribes to the live SSE feed, derives filter
// option lists, applies the pure filter, groups by project, and renders the
// grouped cards + filter bar. Port of v1 public/agents.js (the data layer; the
// duration ticker lives per-card in AgentCard).

import { useMemo, useState } from "react";
import { useLiveSessions } from "@/hooks/useLiveSessions";
import { downloadCsv } from "@/lib/export";
import { useT } from "@/i18n/provider";
import { agents } from "@/i18n/dictionaries/agents";
import { FilterBar } from "./FilterBar";
import { AgentCard } from "./AgentCard";
import {
  applyFilters,
  toCsvRow,
  EMPTY_FILTERS,
  AGENT_CSV_COLUMNS,
  type AgentFilters,
} from "./filters";
import type { LiveSession } from "@/hooks/useLiveSessions";

const OTHER = "Khác";

// Sorted unique non-empty values of a string field across sessions.
function options(list: LiveSession[], pick: (s: LiveSession) => string | null): string[] {
  const set = new Set<string>();
  for (const s of list) {
    const v = pick(s);
    if (v) set.add(v);
  }
  return [...set].sort();
}

export function AgentsClient() {
  const t = useT(agents);
  const { sessions, connected, stuckIds } = useLiveSessions();
  const [filters, setFilters] = useState<AgentFilters>(EMPTY_FILTERS);

  const projects = useMemo(() => options(sessions, (s) => s.projectName), [sessions]);
  const models = useMemo(() => options(sessions, (s) => s.model), [sessions]);
  const branches = useMemo(() => options(sessions, (s) => s.gitBranch), [sessions]);

  const filtered = useMemo(() => applyFilters(sessions, filters), [sessions, filters]);
  const stuckSet = useMemo(() => new Set(stuckIds), [stuckIds]);

  // Group filtered sessions by project; null → "Khác" sinks to the end.
  const groups = useMemo(() => {
    const map = new Map<string, LiveSession[]>();
    for (const s of filtered) {
      const key = s.projectName ?? OTHER;
      (map.get(key) ?? map.set(key, []).get(key)!).push(s);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b),
    );
  }, [filtered]);

  const exportCsv = () =>
    downloadCsv("agents.csv", filtered.map(toCsvRow), [...AGENT_CSV_COLUMNS]);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          Agents
          <span
            title={connected ? "live" : "offline"}
            className={"h-2 w-2 rounded-full " + (connected ? "bg-green-500" : "bg-neutral-400")}
          />
        </h1>
        <span className="text-sm text-neutral-500">
          {t("agents.count", { shown: filtered.length, total: sessions.length })}
        </span>
      </div>

      <FilterBar
        value={filters}
        onChange={setFilters}
        onExport={exportCsv}
        projects={projects}
        models={models}
        branches={branches}
      />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
          <p className="font-medium">
            {sessions.length === 0 ? t("agents.emptyNone") : t("agents.emptyMatch")}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {sessions.length === 0 ? t("agents.emptyNoneSub") : t("agents.emptyMatchSub")}
          </p>
        </div>
      ) : (
        groups.map(([name, items]) => (
          <section key={name} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              {name}
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800">
                {items.length}
              </span>
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
              {items.map((s) => (
                <AgentCard key={s.id} s={s} stuck={stuckSet.has(s.id)} />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/components/agents/AgentsClient`
Expected: PASS.

---

## Task 6: rewrite `app/agents/page.tsx` — thin server shell

**Files:**
- Modify (rewrite): `v2/src/app/agents/page.tsx`

The root layout does NOT mount `I18nProvider`, so the page must wrap the client tree in it (reading the lang cookie server-side). The page keeps the existing `AppHeader` + `auth()` guard.

- [ ] **Step 1: Write the implementation**

```tsx
// v2/src/app/agents/page.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { AgentsClient } from "@/components/agents/AgentsClient";
import { I18nProvider } from "@/i18n/provider";
import { readLangFromCookie, LANG_COOKIE } from "@/i18n/cookie";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const lang = readLangFromCookie((await cookies()).get(LANG_COOKIE)?.value) ?? "vi";

  return (
    <div>
      <AppHeader current="/agents" role={session.user.role} />
      <I18nProvider lang={lang}>
        <AgentsClient />
      </I18nProvider>
    </div>
  );
}
```

- [ ] **Step 2: Type-check the page**

Run: `cd v2 && npx tsc --noEmit`
Expected: no errors in `src/app/agents/page.tsx` or `src/components/agents/*`.

> Note: `readLangFromCookie` takes a cookie *value* string; `cookies().get(...).value` is that value (not the whole header). `readLangFromCookie` only matches the `laam_lang=` key, so passing the bare value returns null and falls back to "vi" — to make it parse, pass the reconstructed `${LANG_COOKIE}=${value}`. **Correction applied below.**

Use this exact body so the cookie parses:

```tsx
  const raw = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = readLangFromCookie(raw ? `${LANG_COOKIE}=${raw}` : null) ?? "vi";
```

---

## Task 7: full package verification

- [ ] **Step 1: Run all owned tests**

Run: `cd v2 && npx vitest run src/components/agents src/app/agents`
Expected: all PASS.

- [ ] **Step 2: Type-check**

Run: `cd v2 && npx tsc --noEmit`
Expected: no new errors in owned files.

- [ ] **Step 3: Checkpoint + report**

Write `.serena/checkpoint/list-2026-06-03.md`; mark Task #1 completed; SendMessage to team-lead with files + pasted vitest summary + the `onExport` deviation note.

---

## Self-Review notes
- **Spec coverage:** applyFilters (q/project/model/status incl. stuck/branch/window) ✓; AgentsClient group-by-project + count + CSV + connected indicator ✓; AgentCard status/stuck/LOCAL badges + live ticker + meta + SubAgentList ✓; SubAgentList ✓; AGENT_CSV_COLUMNS mirrors v1 ✓; thin server shell ✓.
- **Deviation (fail-loud):** `FilterBar` gains an additive `onExport` prop (CSV button needs filtered rows held by AgentsClient). Locked shape otherwise unchanged. Flagged to TL.
- **Deviation:** AGENT_CSV_COLUMNS omits v1 projectPath/user/assistantMessageCount (absent from LiveSession) — documented in code comment.
- **Provider gotcha:** root layout lacks I18nProvider → page mounts it (owned file), reading lang cookie.
