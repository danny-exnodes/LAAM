# V2 Wave 0 — Shared Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Scope-check note:** Wave 0 is 5 independent subsystems (Packages A–E). Each is independently testable and is intended to be owned by ONE team agent who authors their detailed bite-sized TDD sub-plan (via superpowers:writing-plans) for their package and executes it. THIS document is the **coordination plan**: it fixes Task 0 (shared prep — done ONCE by the coordinator) and the **shared interfaces** every package must conform to, so the packages compose without drift.

**Goal:** Build the cross-cutting infrastructure (i18n vi/en/zh, SSE real-time, `/api/stats`, rich-render+chart primitives, export utils) that Waves 1–4 depend on, in the `v2/` Next.js app.

**Architecture:** Next.js 16 App Router + React 19 + TS + Tailwind 4 + Drizzle/Postgres. Pure-logic modules (i18n resolver, stats aggregation, export serializers) are unit-tested with vitest; React components are smoke-tested with @testing-library/react + jsdom and verified live. SSE uses a Next route handler returning a `ReadableStream`; the client consumes it via an `EventSource` hook.

**Tech Stack:** vitest, @testing-library/react, jsdom (new — test harness); react-markdown + remark-gfm + rehype-sanitize (markdown/tables); recharts (charts — already installed); react-leaflet + leaflet via `next/dynamic({ssr:false})` (maps); react-syntax-highlighter (code); jspdf (PDF export).

---

## File Structure

| Path | Responsibility | Package |
|---|---|---|
| `v2/vitest.config.ts` | vitest + jsdom config, `@/` alias | 0 |
| `v2/vitest.setup.ts` | RTL matchers, jsdom polyfills | 0 |
| `v2/src/i18n/types.ts` | `Lang`, `Dict`, `Translator` types | A |
| `v2/src/i18n/dictionaries/{common,dashboard,agents,chat,connectors}.ts` | per-namespace vi/en/zh strings (ported from `public/i18n.*.js`) | A |
| `v2/src/i18n/index.ts` | `resolve(dict, lang, key, vars)` pure resolver | A |
| `v2/src/i18n/provider.tsx` | `I18nProvider`, `useT()`, `useLang()` (client) | A |
| `v2/src/i18n/cookie.ts` | read/write `laam_lang` cookie (server+client) | A |
| `v2/src/lib/stats.ts` | `computeStats(sessions): Stats` (port of `lib/stats.js`) | B |
| `v2/src/lib/stats.types.ts` | `Stats` and sub-types | B |
| `v2/src/app/api/stats/route.ts` | `GET /api/stats` → `computeStats` over DB rows | B |
| `v2/src/app/api/events/route.ts` | `GET /api/events` SSE stream | C |
| `v2/src/lib/events-bus.ts` | in-process pub/sub for SSE (module singleton) | C |
| `v2/src/lib/stuck.ts` | `isStuck(session, thresholdMin)` pure fn | C |
| `v2/src/hooks/useLiveSessions.ts` | client hook: EventSource → session list + status | C |
| `v2/src/components/render/MarkdownView.tsx` | sanitized markdown + tables + code highlight + `chart`/`map` fences | D |
| `v2/src/components/render/ChartBlock.tsx` | parse v1 ```chart``` JSON → recharts | D |
| `v2/src/components/render/MapBlock.tsx` | parse v1 ```map``` JSON → react-leaflet (dynamic, ssr:false) | D |
| `v2/src/components/render/CodeBlock.tsx` | react-syntax-highlighter + copy button | D |
| `v2/src/lib/export/{csv,markdown,json,pdf}.ts` | serializers | E |
| `v2/src/lib/export/index.ts` | `downloadCsv/downloadJson/downloadMarkdown/downloadPdf` browser helpers | E |

**Disjointness:** Packages A–E touch disjoint files. The ONLY shared files are `package.json`, `vitest.config.ts`, `tsconfig.json` — all created/finalized in Task 0 so parallel package work never edits them. Coordinator commits each package after review; package agents do NOT run `git commit`.

---

## Shared Interfaces (LOCKED — every package conforms to these exact signatures)

```ts
// i18n (Package A) — consumed by Waves 1–4
export type Lang = 'vi' | 'en' | 'zh';
export type Dict = Record<string, { vi: string; en: string; zh: string }>;
export function resolve(dict: Dict, lang: Lang, key: string, vars?: Record<string, string | number>): string;
// provider.tsx
export function I18nProvider(props: { lang: Lang; children: React.ReactNode }): JSX.Element;
export function useT(namespace: Dict): (key: string, vars?: Record<string, string | number>) => string;
export function useLang(): { lang: Lang; setLang: (l: Lang) => void };

// stats (Package B)
export interface Stats {
  totals: { sessions: number; running: number; idle: number; done: number;
            messages: number; toolCalls: number; subAgents: number;
            tokensIn: number; tokensOut: number; costUsd: number; avgDurationMs: number };
  byStatus: Record<string, number>;
  byModel: Record<string, number>;
  byBranch: Record<string, number>;
  byProject: { project: string; sessions: number; tokensIn: number; tokensOut: number; toolCalls: number }[];
  toolLeaderboard: { name: string; count: number; errors: number; errorRate: number; avgDurationMs: number }[];
  modelComparison: { model: string; sessions: number; tokens: number; costUsd: number; avgDurationMs: number; tokensPerMin: number; doneRate: number }[];
  heatmap: number[][]; // [weekday 0-6][hour 0-23]
  activity: { t: number; sessions: number; tokens: number }[];
  topByDuration: { id: string; label: string; durationMs: number }[];
  topByTokens: { id: string; label: string; tokens: number }[];
}
export function computeStats(sessions: SessionRow[]): Stats;
// SessionRow = the shape selected from agentSessions (id, status, model, gitBranch, startedAt,
//   lastActivity, messageCount, toolCount, subAgentCount, tokensIn, tokensOut, costUsd, tools, histo, projectId).

// SSE (Package C)
// route: GET /api/events → text/event-stream, emits `data: {type:'sessions', sessions:[...]}` + `:keepalive`
export function isStuck(s: { status: string; lastActivity: number | Date }, thresholdMin: number): boolean;
export function useLiveSessions(): { sessions: LiveSession[]; connected: boolean; stuckIds: string[] };

// render (Package D)
export function MarkdownView(props: { source: string; className?: string }): JSX.Element;
// recognizes fenced ```chart and ```map blocks (JSON bodies in v1 format) and renders ChartBlock/MapBlock.

// export (Package E)
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string;
export function toMarkdown(conversation: { role: string; content: string }[]): string;
export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns: string[]): void;
export function downloadJson(filename: string, data: unknown): void;
export function downloadMarkdown(filename: string, md: string): void;
export function downloadPdf(filename: string, title: string, body: string): void;
```

v1 source of truth to port (read these — content is specified, not a placeholder):
- A: `public/i18n.common.js`, `public/i18n.dash.js`, `public/i18n.agents.js`, `public/i18n.chat.js`, `public/i18n.connectors.js`
- B: `lib/stats.js` (`computeStats` + helpers `buildActivity`, `topN`, leaderboard)
- C: `public/common.js` (`connectSSE`, `isStuck`, `notify`), `bin/laam.js` `/api/events` handler
- D: `public/chat-render.js` (markdown/code/chart), `public/chat-geo.js` (map block), v1 ```chart```/```map``` JSON schema
- E: `public/export.js` (CSV + PDF), `public/chat-export.js` (MD/JSON)

---

## Task 0 — Shared prep (coordinator only, BEFORE parallel work)

**Files:** Modify `v2/package.json`; Create `v2/vitest.config.ts`, `v2/vitest.setup.ts`.

- [ ] **Step 1: Install test harness + Wave 0 runtime deps**

Run (in `v2/`):
```bash
npm i react-markdown remark-gfm rehype-sanitize react-leaflet leaflet react-syntax-highlighter jspdf
npm i -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @types/leaflet @types/react-syntax-highlighter
```
Expected: installs succeed; `package.json` shows the new deps.

- [ ] **Step 2: Add test scripts to `v2/package.json`**

Add to `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Create `v2/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'], globals: true },
});
```

- [ ] **Step 4: Create `v2/vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Smoke test the harness**

Create `v2/src/lib/__smoke__.test.ts`:
```ts
import { expect, test } from 'vitest';
test('vitest runs', () => { expect(1 + 1).toBe(2); });
```
Run: `npm test`
Expected: 1 passed. Then delete the smoke file.

- [ ] **Step 6: Commit**
```bash
git add v2/package.json v2/package-lock.json v2/vitest.config.ts v2/vitest.setup.ts
git commit -m "chore(v2): add vitest harness + Wave 0 deps"
```

---

## Package A — i18n (vi/en/zh) — OWNER: agent `i18n`

**Deliverable:** language switching works live; `useT(dict)('key')` resolves per active lang; lang persists via `laam_lang` cookie; dictionaries ported for all 5 namespaces.

**Detailed sub-plan:** owner authors via writing-plans. Must include at minimum:
- [ ] Test `resolve()`: returns correct lang string; falls back to key when missing; interpolates `{name}` vars. (`v2/src/i18n/index.test.ts`)
- [ ] Implement `resolve()` to pass.
- [ ] Test `I18nProvider`+`useT`: render a component using `useT`, assert vi vs en output when provider lang differs. (RTL)
- [ ] Implement provider/hook (React context).
- [ ] Port each `public/i18n.*.js` dict → `dictionaries/*.ts` preserving every key (3 langs). Test: snapshot key-count equals v1 key-count per namespace.
- [ ] `cookie.ts` read/write + a `LangSwitcher` wiring; verify live switch in browser.

**Success criteria:** `npm test` green for i18n; in browser, switching language updates a sample page without reload; no missing-key fallbacks logged for ported namespaces.

---

## Package B — `/api/stats` (port `lib/stats.js`) — OWNER: agent `stats`

**Deliverable:** `computeStats(sessions)` produces the full `Stats` object (table above); `GET /api/stats` returns it from DB rows; output matches v1 `/api/stats` for the same data.

**Detailed sub-plan:** owner authors via writing-plans. Must include:
- [ ] Port `lib/stats.js` logic into typed `computeStats` in `src/lib/stats.ts` (+ `stats.types.ts`).
- [ ] Unit tests with a fixture array of `SessionRow`s asserting: totals (sessions/running/idle/done, tokens, cost, avgDuration), byStatus/byModel/byBranch counts, byProject aggregation, toolLeaderboard (count/errors/errorRate/avgDurationMs), modelComparison (tokensPerMin, doneRate), heatmap 7×24 shape + bucket counts, activity buckets, topByDuration/topByTokens ordering. (`src/lib/stats.test.ts`)
- [ ] **Rule 13 guard:** test that a tool name returned with altered casing from input data is still keyed by the exact stored name (code-derived), not normalized.
- [ ] `GET /api/stats` route: auth-guard (session required), select rows via Drizzle, call `computeStats`, return JSON. Smoke test the handler with a mocked db.

**Success criteria:** `npm test` green; `curl localhost:3000/api/stats` (authed) returns a payload whose totals match v1 `/api/stats` on the same session set (±0 for counts).

---

## Package C — SSE real-time + `useLiveSessions` — OWNER: agent `sse`

**Deliverable:** `GET /api/events` streams session updates; client hook re-renders without manual sync; `isStuck` drives a stuck-id list; browser notification on new stuck.

**Detailed sub-plan:** owner authors via writing-plans. Must include:
- [ ] `isStuck(session, thresholdMin)` pure fn + tests (running & lastActivity older than threshold → true; done → false; boundary exactly at threshold). (`src/lib/stuck.test.ts`)
- [ ] `events-bus.ts` module singleton (`subscribe(cb)`, `publish(evt)`) + test subscribe/publish/unsubscribe.
- [ ] `GET /api/events` route returning `ReadableStream` with `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`; emits initial `sessions` event + on bus publish + `:keepalive` comment every 25s; cleans up on cancel. (Port semantics from `bin/laam.js` `/api/events`.)
- [ ] `useLiveSessions()` hook: opens `EventSource('/api/events')`, parses `data:`, exposes `{sessions, connected, stuckIds}`; computes `stuckIds` via `isStuck`; fires `Notification` for newly-stuck (guarded by permission). RTL test with a mocked `EventSource`.

**Success criteria:** `npm test` green; with two browser tabs, a session status change appears in both within ~1s with no reload; stuck session shows in `stuckIds`.

**Note:** the sync trigger that publishes to the bus is wired in Wave 1 (Agents) / by `/api/sync`; Package C only needs the bus + route + hook + a test publish.

---

## Package D — rich-render + chart/map primitives — OWNER: agent `render`

**Deliverable:** `MarkdownView` renders sanitized markdown + GFM tables + highlighted code with copy button; ```chart``` fences render recharts; ```map``` fences render react-leaflet (ssr-safe).

**Detailed sub-plan:** owner authors via writing-plans. Must include:
- [ ] `MarkdownView` with react-markdown + remark-gfm + rehype-sanitize. RTL test: renders a table to `<table>`; renders `**bold**`; strips a `<script>` (XSS). (`src/components/render/MarkdownView.test.tsx`)
- [ ] `CodeBlock` (react-syntax-highlighter) + copy button; RTL test copy button present, language class applied.
- [ ] `ChartBlock`: parse v1 ```chart``` JSON ({type:'bar'|'line'|'pie'|..., data, options}) → recharts component. Unit-test the JSON→props mapper for bar+line+pie; component renders without throwing. (Mirror v1 `chat-render.js` chart schema.)
- [ ] `MapBlock`: dynamic import react-leaflet with `{ssr:false}`; parse v1 ```map``` JSON (center, markers, route) → Leaflet. Unit-test the parser; component lazy-loads (assert dynamic boundary).
- [ ] Wire fence detection into `MarkdownView` (custom `code` renderer dispatching on language `chart`/`map`).

**Success criteria:** `npm test` green; a demo page rendering a markdown string containing a table + a ```chart``` + a ```map``` displays all three; `next build` succeeds (SSR-safe leaflet).

---

## Package E — export utils (CSV/MD/JSON/PDF) — OWNER: agent `export`

**Deliverable:** pure serializers + browser download helpers; CSV matches v1 columns; PDF via jspdf.

**Detailed sub-plan:** owner authors via writing-plans. Must include:
- [ ] `toCsv(rows, columns)` + tests: header row, value escaping (commas, quotes, newlines), column ordering, empty rows. (`src/lib/export/csv.test.ts`)
- [ ] `toMarkdown(conversation)` + test: role headers + content, code fences preserved. (Port `chat-export.js`.)
- [ ] `downloadJson/downloadCsv/downloadMarkdown` (Blob + anchor click) — guard `typeof window`; RTL/jsdom test that a Blob URL is created.
- [ ] `downloadPdf(filename, title, body)` via jspdf — smoke test it produces a non-empty Blob.

**Success criteria:** `npm test` green; in browser, exporting a sample dataset downloads a CSV whose columns match v1 `export.js`, and a PDF opens.

---

## Integration checkpoint (coordinator, after A–E merged)

- [ ] `cd v2 && npm test` — all package suites green.
- [ ] `cd v2 && npm run build` — type-check + build succeed (catches SSR/leaflet issues).
- [ ] Manual live: a scratch `/dev/wave0` page (or temporary) that (1) switches language, (2) shows `/api/stats` JSON, (3) subscribes via `useLiveSessions`, (4) renders a markdown+chart+map sample, (5) triggers a CSV+PDF download. Remove the scratch page after verification.
- [ ] Update `docs/v2-parity-roadmap.md` (mark Wave 0 done) + Serena `services/v2-app.md` + checkpoint.
- [ ] Commit integration + tag the Wave.

---

## Self-Review (completed by author)

- **Spec coverage:** 0.1 i18n→A; 0.2 SSE→C; 0.3 /api/stats→B; 0.4 render→D; 0.5 export→E. All 5 mapped. ✅
- **Type consistency:** shared signatures locked in "Shared Interfaces"; `Stats`, `Lang`, `useLiveSessions`, `MarkdownView`, export fns referenced identically across packages. ✅
- **Placeholders:** Task 0 has full commands/code. Packages A–E intentionally delegate bite-sized step authoring to owner agents (per scope-check), with concrete test lists + success criteria + exact files/interfaces — not vague TODOs. Each owner MUST run writing-plans before coding. ✅
- **Parallel safety:** disjoint files; package.json/test-config finalized in Task 0; agents don't commit. ✅
