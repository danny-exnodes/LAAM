# Constellation Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a full-screen `/constellation` page (immersive "Agent Constellation" command-center) reached from Chat's Assistant Map button, wired to real LAAM data, the real `/api/chat` stream, Web Speech + optional neural TTS, an audio-reactive canvas, and real weather.

**Architecture:** A Next.js route group `(fullscreen)` escapes the app chrome and gates auth server-side. A client orchestrator (`ConstellationClient`) fetches real agents/tools/connectors, renders a radial canvas + HTML node overlay (pure layout modules), drives voice via `useVoice` + a new `useAudioAnalyser`, and sends commands to `/api/chat` reusing `splitFrames`. The old chat modal + its component are removed.

**Tech Stack:** Next.js 16 (App Router, React 19, TS), Tailwind v4, Auth.js v5, Web Speech API, Canvas 2D, `next/font/google`, Vitest + Testing Library + jsdom, Open-Meteo (weather).

**Spec:** `docs/superpowers/specs/2026-07-01-constellation-page-design.md`. **Prototype (verbatim visual source):** `ennam-agent-constellation-voice.html` (repo root).

## Global Constraints

- **Next.js 16** — read `node_modules/next/dist/docs/` before new API usage; `export const dynamic = "force-dynamic"` on the authed page.
- **i18n vi/en/zh** — every user-facing string added to `src/i18n/dictionaries/constellation.ts` for all three languages; a parity test enforces it. Cookie is `laam_lang`; use `useT`/`useLang`.
- **Rule 13** — nodes carry ground-truth objects (`CatalogGroup`/`CatalogTool`/agent id), never reconstructed from strings; tests mock the model returning altered strings.
- **Write-gate preserved** — a `pending_write` frame must round-trip a confirm; never auto-execute writes.
- **Matte-dark exemption is deliberate** — this page may use `backdrop-filter`/custom fonts/gold accent; do not "reconcile" to matte-dark. The no-glassmorphism tests target only `MatteCard`/`AgentDrawer` and must stay green.
- **Reduced motion** — all animation (canvas, waveform, fact rotation) disabled under `prefers-reduced-motion`.
- **SSR-safe** — all `window`/`document`/`navigator`/`AudioContext`/canvas access inside effects or `typeof window` guards.
- **No new DB migration.** `customAgentId` persists to `localStorage` key `laam:chat:agent` (same as ChatClient).
- **Tests:** `npm test` = `vitest run`; typecheck `npx tsc --noEmit`. The 4 pre-existing `src/lib/search.test.ts` failures are out of scope and remain.

---

### Task 1: Scaffold route group, page shell, i18n, nav swap, remove old modal

**Files:**
- Create: `src/app/(fullscreen)/layout.tsx`
- Create: `src/app/(fullscreen)/constellation/page.tsx`
- Create: `src/components/constellation/ConstellationClient.tsx` (shell only this task)
- Create: `src/i18n/dictionaries/constellation.ts`
- Test: `src/i18n/dictionaries/constellation.test.ts`
- Modify: `src/components/chat/ChatClient.tsx` (remove modal import/state/block; swap 2 buttons to `<Link>`)
- Modify: `src/components/chat/ChatClient.test.tsx` (update the 4 modal tests)
- Delete: `src/components/chat/Constellation.tsx`, `src/components/chat/constellationLayout.ts`, `src/components/chat/constellationLayout.test.ts`, `src/components/chat/VoiceWave.tsx`

**Interfaces:**
- Produces: route `/constellation` (authed, no chrome); `constellation` dict (`Dict`); `<ConstellationClient greetingName: string; lang: Lang />`.
- Consumes: `auth()` from `@/auth`; `useT` from `@/i18n/provider`; `Lang` from `@/i18n/types`.

- [ ] **Step 1: Write the failing i18n parity test**

Create `src/i18n/dictionaries/constellation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { constellation } from "./constellation";

describe("constellation dictionary", () => {
  it("has a non-empty vi/en/zh for every key", () => {
    const keys = Object.keys(constellation);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const [key, entry] of Object.entries(constellation)) {
      expect(entry.vi, `${key}.vi`).toBeTruthy();
      expect(entry.en, `${key}.en`).toBeTruthy();
      expect(entry.zh, `${key}.zh`).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/dictionaries/constellation.test.ts`
Expected: FAIL — cannot find module `./constellation`.

- [ ] **Step 3: Create the dictionary**

Create `src/i18n/dictionaries/constellation.ts` (extend later tasks add keys; start with the shell + state + command + sysinfo + weather-code labels):
```ts
import type { Dict } from "../types";

export const constellation: Dict = {
  "constellation.title": { vi: "Bản đồ trợ lý", en: "Agent Constellation", zh: "助手星图" },
  "constellation.regionAria": { vi: "Bản đồ agent và công cụ", en: "Agents and tools map", zh: "Agent 与工具星图" },
  "constellation.back": { vi: "Mở trong Chat", en: "Open in Chat", zh: "在聊天中打开" },
  "constellation.nodeAria": { vi: "Chọn {name}", en: "Focus {name}", zh: "聚焦 {name}" },
  "constellation.commandPlaceholder": { vi: "Nhắn tin…", en: "Message…", zh: "发消息…" },
  "constellation.send": { vi: "Gửi", en: "Send", zh: "发送" },
  "constellation.chat": { vi: "Trò chuyện", en: "Chat", zh: "聊天" },
  "constellation.voice": { vi: "Giọng nói", en: "Voice", zh: "语音" },
  "constellation.stateIdle": { vi: "SẴN SÀNG", en: "STANDBY", zh: "待命" },
  "constellation.stateListening": { vi: "ĐANG NGHE", en: "LISTENING", zh: "聆听中" },
  "constellation.stateThinking": { vi: "ĐANG XỬ LÝ", en: "PROCESSING", zh: "处理中" },
  "constellation.stateSpeaking": { vi: "ĐANG NÓI", en: "SPEAKING", zh: "朗读中" },
  "constellation.greetMorning": { vi: "Chào buổi sáng", en: "Good morning", zh: "早上好" },
  "constellation.greetAfternoon": { vi: "Chào buổi chiều", en: "Good afternoon", zh: "下午好" },
  "constellation.greetEvening": { vi: "Chào buổi tối", en: "Good evening", zh: "晚上好" },
  "constellation.onThisDay": { vi: "HÔM NAY", en: "ON THIS DAY", zh: "历史上的今天" },
  "constellation.connectHint": { vi: "Chưa kết nối — mở Connectors để bật", en: "Not connected — open Connectors to enable", zh: "未连接 — 打开连接器以启用" },
  // "on this day" facts (rotated; static, curated)
  "constellation.fact1": { vi: "Tim Berners-Lee đề xuất World Wide Web tại CERN.", en: "Tim Berners-Lee proposed the World Wide Web at CERN.", zh: "蒂姆·伯纳斯-李在 CERN 提出万维网。" },
  "constellation.fact2": { vi: "Kiến trúc Transformer (2017) là nền tảng của phần lớn LLM hiện đại.", en: "The Transformer (2017) underpins most modern LLMs.", zh: "Transformer 架构（2017）是大多数现代大模型的基础。" },
  "constellation.fact3": { vi: "Hệ đa tác tử có gốc lý thuyết từ thập niên 1980.", en: "Multi-agent systems trace back to 1980s theory.", zh: "多智能体系统的理论可追溯到 1980 年代。" },
  // Open-Meteo weather-code buckets (WMO) — added in Task 7
  "constellation.wxClear": { vi: "Trời quang", en: "Clear", zh: "晴" },
  "constellation.wxCloud": { vi: "Nhiều mây", en: "Cloudy", zh: "多云" },
  "constellation.wxRain": { vi: "Mưa", en: "Rain", zh: "雨" },
  "constellation.wxSnow": { vi: "Tuyết", en: "Snow", zh: "雪" },
  "constellation.wxFog": { vi: "Sương mù", en: "Fog", zh: "雾" },
  "constellation.wxStorm": { vi: "Giông", en: "Storm", zh: "雷暴" },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/i18n/dictionaries/constellation.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the fullscreen layout (auth guard, no chrome, scoped fonts)**

Create `src/app/(fullscreen)/layout.tsx`:
```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Chakra_Petch, IBM_Plex_Mono } from "next/font/google";
import { auth } from "@/auth";

const chakra = Chakra_Petch({ subsets: ["latin", "vietnamese"], weight: ["300", "400", "500", "600"], variable: "--font-chakra" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plexmono" });

export default async function FullscreenLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <div className={`${chakra.variable} ${mono.variable}`}>{children}</div>;
}
```

- [ ] **Step 6: Create the page (server component → client shell)**

Create `src/app/(fullscreen)/constellation/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { readLangFromCookie } from "@/i18n/cookie";
import { ConstellationClient } from "@/components/constellation/ConstellationClient";

export const dynamic = "force-dynamic";

export default async function ConstellationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const lang = readLangFromCookie((await cookies()).toString());
  return <ConstellationClient greetingName={session.user.name ?? ""} lang={lang} />;
}
```
(Verify `readLangFromCookie` signature in `src/i18n/cookie.ts`; if it takes the raw cookie string, the above is correct — otherwise pass `cookies().get("laam_lang")?.value`.)

- [ ] **Step 7: Create the client shell**

Create `src/components/constellation/ConstellationClient.tsx` (shell only; fleshed out in later tasks):
```tsx
"use client";
import { useT } from "@/i18n/provider";
import { constellation } from "@/i18n/dictionaries/constellation";
import type { Lang } from "@/i18n/types";
import Link from "next/link";

export function ConstellationClient({ greetingName, lang }: { greetingName: string; lang: Lang }) {
  const t = useT(constellation);
  return (
    <div
      className="relative h-dvh w-screen overflow-hidden bg-[radial-gradient(135%_115%_at_50%_52%,#1d527e_0%,#0e3559_36%,#08233f_64%,#041426_100%)] text-[#eaf6ff]"
      style={{ fontFamily: "var(--font-chakra), sans-serif" }}
      role="application"
      aria-label={t("constellation.regionAria")}
    >
      <Link href="/chat" className="absolute right-4 top-4 z-10 rounded-full border border-[#5bd6ff]/30 bg-[#0a1e34]/60 px-4 py-2 text-sm text-[#a9e9ff]">
        {t("constellation.back")}
      </Link>
      <h1 className="absolute left-1/2 top-6 z-10 -translate-x-1/2 text-sm tracking-[0.3em] text-[#a9e9ff]">
        {t("constellation.title")}
      </h1>
      {/* Canvas, nodes, sysinfo, command dock added in later tasks. greetingName={greetingName} lang={lang} */}
    </div>
  );
}
```

- [ ] **Step 8: Swap the Assistant Map buttons to links + remove the modal in ChatClient**

In `src/components/chat/ChatClient.tsx`:
- Add `import Link from "next/link";` near the top imports.
- Remove `import { Constellation } from "./Constellation";` (line ~16).
- Remove `const [constellationOpen, setConstellationOpen] = useState(false);` (line ~69).
- Replace the header button (lines ~846–854) with:
```tsx
<Link
  href="/constellation"
  aria-label={t("chat.constellationOpenAria")}
  title={t("chat.constellationTitle")}
  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
>
  <Orbit size={18} aria-hidden />
</Link>
```
- Replace the empty-state button (lines ~908–914) with:
```tsx
<Link
  href="/constellation"
  className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/40 px-4 py-2 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-muted)]"
>
  <Orbit size={16} aria-hidden /> {t("chat.constellationOpen")}
</Link>
```
- Delete the entire modal overlay block `{constellationOpen && ( … )}` (lines ~1018–1059).

- [ ] **Step 9: Delete the old modal files**

```bash
git rm src/components/chat/Constellation.tsx src/components/chat/constellationLayout.ts src/components/chat/constellationLayout.test.ts src/components/chat/VoiceWave.tsx
```

- [ ] **Step 10: Update ChatClient modal tests**

In `src/components/chat/ChatClient.test.tsx` (keep the `mockFetchWithAgents`/`renderChat` helpers):
- Rewrite the "empty-state shows the Assistant-map toggle" test (lines ~314–318) to assert a link, e.g.:
```tsx
it("empty-state links to the constellation page", async () => {
  renderChat();
  const link = await screen.findByRole("link", { name: /bản đồ trợ lý|assistant/i });
  expect(link).toHaveAttribute("href", "/constellation");
});
```
- Delete the three modal-behavior tests (pick-tool, select-agent, Escape) at lines ~322–352 — their behavioral assertions move to Task 3's interaction test.

- [ ] **Step 11: Typecheck + run affected tests**

Run: `npx tsc --noEmit` → Expected: clean.
Run: `npx vitest run src/components/chat/ChatClient.test.tsx src/i18n/dictionaries/constellation.test.ts` → Expected: PASS.

- [ ] **Step 12: Manual smoke (optional, if dev server running) + Commit**

```bash
git add -A
git commit -m "feat(constellation): scaffold /constellation route + i18n; replace chat modal with page link"
```

---

### Task 2: Pure node model + radial layout

**Files:**
- Create: `src/lib/constellation/nodeModel.ts`
- Test: `src/lib/constellation/nodeModel.test.ts`
- Create: `src/lib/constellation/field.ts`
- Test: `src/lib/constellation/field.test.ts`

**Interfaces:**
- Consumes: `CatalogGroup`, `CatalogTool` from `@/lib/chat/toolCatalog`; `ConnectorStatus` from `@/lib/connectors/types`.
- Produces:
  - `type NodeState = "active" | "linked" | "idle"`
  - `type NodeRef = { kind: "agent"; agentId: string } | { kind: "tool"; group: CatalogGroup; tool?: CatalogTool } | { kind: "connectorIdle"; connectorId: string }`
  - `type ConstNode = { id: string; label: string; ring: "inner" | "outer"; state: NodeState; ref: NodeRef }`
  - `buildNodes(input): ConstNode[]`
  - `type Placed = ConstNode & { x: number; y: number }` (origin-centered, ~-50..50)
  - `placeNodes(nodes: ConstNode[], opts?: { mobile?: boolean }): Placed[]`

- [ ] **Step 1: Write failing tests for `buildNodes`**

Create `src/lib/constellation/nodeModel.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildNodes } from "./nodeModel";
import type { CatalogGroup } from "@/lib/chat/toolCatalog";

const grp = (id: string, label: string): CatalogGroup => ({ id, type: "connector", label, tools: [{ name: `${id}.t`, description: "", kind: "read", args: [] }] });

describe("buildNodes", () => {
  it("puts agents on the inner ring and marks the selected one active", () => {
    const nodes = buildNodes({ agents: [{ id: "a1", name: "Alpha" }, { id: "a2", name: "Beta" }], groups: [], connectors: [], selectedAgentId: "a2" });
    expect(nodes.filter(n => n.ring === "inner")).toHaveLength(2);
    expect(nodes.find(n => n.ref.kind === "agent" && n.ref.agentId === "a2")!.state).toBe("active");
    expect(nodes.find(n => n.ref.kind === "agent" && n.ref.agentId === "a1")!.state).toBe("linked");
  });

  it("puts tool groups on the outer ring as linked, carrying the SOURCE object (Rule 13)", () => {
    const g = grp("connector:x", "X");
    const nodes = buildNodes({ agents: [], groups: [g], connectors: [], selectedAgentId: undefined });
    const n = nodes.find(x => x.ring === "outer")!;
    expect(n.state).toBe("linked");
    expect(n.ref.kind === "tool" && n.ref.group).toBe(g); // identical reference, not a copy
  });

  it("adds disconnected/needs_reconnect connectors as idle nodes", () => {
    const nodes = buildNodes({ agents: [], groups: [], connectors: [
      { id: "gmail", name: "Gmail", status: "disconnected" },
      { id: "jira", name: "Jira", status: "needs_reconnect" },
      { id: "slack", name: "Slack", status: "connected" },
    ], selectedAgentId: undefined });
    const idle = nodes.filter(n => n.state === "idle");
    expect(idle.map(n => n.label).sort()).toEqual(["Gmail", "Jira"]);
    // "connected" ones are represented by their catalog group, not duplicated here
    expect(nodes.find(n => n.label === "Slack")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/constellation/nodeModel.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 3: Implement `nodeModel.ts`**

```ts
import type { CatalogGroup, CatalogTool } from "@/lib/chat/toolCatalog";
import type { ConnectorStatus } from "@/lib/connectors/types";

export type NodeState = "active" | "linked" | "idle";
export type NodeRef =
  | { kind: "agent"; agentId: string }
  | { kind: "tool"; group: CatalogGroup; tool?: CatalogTool }
  | { kind: "connectorIdle"; connectorId: string };
export type ConstNode = { id: string; label: string; ring: "inner" | "outer"; state: NodeState; ref: NodeRef };

export function buildNodes(input: {
  agents: { id: string; name: string }[];
  groups: CatalogGroup[];
  connectors: { id: string; name: string; status: ConnectorStatus }[];
  selectedAgentId?: string;
  focusedGroupId?: string;
}): ConstNode[] {
  const agentNodes: ConstNode[] = input.agents.map((a) => ({
    id: `agent:${a.id}`,
    label: a.name,
    ring: "inner",
    state: a.id === input.selectedAgentId ? "active" : "linked",
    ref: { kind: "agent", agentId: a.id },
  }));

  const groupNodes: ConstNode[] = input.groups.map((g) => ({
    id: `group:${g.id}`,
    label: g.label,
    ring: "outer",
    state: g.id === input.focusedGroupId ? "active" : "linked",
    ref: { kind: "tool", group: g }, // Rule 13: identical source object
  }));

  const idleNodes: ConstNode[] = input.connectors
    .filter((c) => c.status !== "connected")
    .map((c) => ({
      id: `idle:${c.id}`,
      label: c.name,
      ring: "outer",
      state: "idle",
      ref: { kind: "connectorIdle", connectorId: c.id },
    }));

  return [...agentNodes, ...groupNodes, ...idleNodes];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/constellation/nodeModel.test.ts` → Expected: PASS.

- [ ] **Step 5: Write failing tests for `placeNodes`**

Create `src/lib/constellation/field.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { placeNodes } from "./field";
import type { ConstNode } from "./nodeModel";

const mk = (id: string, ring: "inner" | "outer"): ConstNode => ({ id, label: id, ring, state: "linked", ref: { kind: "agent", agentId: id } });

describe("placeNodes", () => {
  it("keeps inner nodes closer to the origin than outer nodes", () => {
    const placed = placeNodes([mk("a", "inner"), mk("b", "outer")]);
    const r = (n: { x: number; y: number }) => Math.hypot(n.x, n.y);
    expect(r(placed.find(p => p.id === "a")!)).toBeLessThan(r(placed.find(p => p.id === "b")!));
  });

  it("spaces a ring evenly (constant angular delta) and is deterministic", () => {
    const placed = placeNodes([mk("a", "outer"), mk("b", "outer"), mk("c", "outer")]);
    const angs = placed.map(p => Math.atan2(p.y, p.x));
    const d1 = angs[1] - angs[0], d2 = angs[2] - angs[1];
    expect(Math.abs(d1 - d2)).toBeLessThan(1e-6);
    expect(placeNodes([mk("a", "outer")])[0]).toEqual(placeNodes([mk("a", "outer")])[0]);
  });
});
```

- [ ] **Step 6: Run to verify fail** — `npx vitest run src/lib/constellation/field.test.ts` → FAIL.

- [ ] **Step 7: Implement `field.ts`**

```ts
import type { ConstNode } from "./nodeModel";

export type Placed = ConstNode & { x: number; y: number };

const INNER = 22;
const OUTER = 40;

// Origin-centered polar layout; angles start at -90° and spread evenly per ring.
export function placeNodes(nodes: ConstNode[], opts?: { mobile?: boolean }): Placed[] {
  const rings: Record<"inner" | "outer", ConstNode[]> = { inner: [], outer: [] };
  for (const n of nodes) rings[n.ring].push(n);
  const radius = { inner: INNER, outer: opts?.mobile ? OUTER * 0.9 : OUTER };
  const out: Placed[] = [];
  for (const ring of ["inner", "outer"] as const) {
    const list = rings[ring];
    list.forEach((n, i) => {
      const ang = -Math.PI / 2 + (list.length ? (i / list.length) * Math.PI * 2 : 0);
      out.push({ ...n, x: Math.cos(ang) * radius[ring], y: Math.sin(ang) * radius[ring] * (opts?.mobile ? 0.72 : 1) });
    });
  }
  return out;
}
```

- [ ] **Step 8: Run to verify pass** — `npx vitest run src/lib/constellation/field.test.ts` → PASS.

- [ ] **Step 9: Typecheck + Commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/constellation
git commit -m "feat(constellation): pure node model + radial layout (Rule 13, tested)"
```

---

### Task 3: Fetch real data + render node overlay + click dispatch

**Files:**
- Create: `src/components/constellation/ConstellationNodes.tsx`
- Modify: `src/components/constellation/ConstellationClient.tsx` (fetch + state + render nodes)
- Test: `src/components/constellation/ConstellationClient.test.tsx`

**Interfaces:**
- Consumes: `buildNodes`, `placeNodes`, `ConstNode`, `Placed`; `GET /api/custom-agents`, `GET /api/chat/tools`, `GET /api/connectors`.
- Produces: `<ConstellationNodes placed: Placed[]; selectedAgentId?: string; onPick: (n: ConstNode) => void; t: Translator />`.

- [ ] **Step 1: Write failing interaction test**

Create `src/components/constellation/ConstellationClient.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ConstellationClient } from "./ConstellationClient";

function mockFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/custom-agents")) return json({ agents: [{ id: "a1", name: "Alpha" }] });
    if (url.includes("/api/chat/tools")) return json({ groups: [{ id: "connector:daab", type: "mcp", label: "DAAB", tools: [{ name: "mcp__daab__kg_query", description: "", kind: "read", args: [] }] }] });
    if (url.includes("/api/connectors")) return json({ connectors: [{ id: "gmail", name: "Gmail", status: "disconnected" }] });
    return json({});
  }));
}
const json = (b: unknown) => ({ ok: true, json: async () => b }) as Response;
const renderPage = () => render(<I18nProvider lang="vi"><ConstellationClient greetingName="Danny" lang="vi" /></I18nProvider>);

describe("ConstellationClient", () => {
  beforeEach(() => { mockFetch(); localStorage.clear(); });

  it("renders nodes from the real endpoints (agent, tool group, idle connector)", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /Alpha/ })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /DAAB/ })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Gmail/ })).toBeTruthy();
  });

  it("clicking an agent node persists customAgentId to localStorage", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Alpha/ }));
    await waitFor(() => expect(localStorage.getItem("laam:chat:agent")).toBe("a1"));
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/components/constellation/ConstellationClient.test.tsx` → FAIL.

- [ ] **Step 3: Implement `ConstellationNodes.tsx`**

```tsx
"use client";
import type { Placed, ConstNode } from "@/lib/constellation/field";
import type { Translator } from "@/i18n/types";

const pct = (v: number) => `${50 + v}%`;
const dot: Record<string, string> = { active: "#ffce7a", linked: "#5bd6ff", idle: "#3d6480" };

export function ConstellationNodes({ placed, onPick, t }: { placed: Placed[]; onPick: (n: ConstNode) => void; t: Translator }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {placed.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onPick(n)}
          aria-label={t("constellation.nodeAria", { name: n.label })}
          style={{ left: pct(n.x), top: pct(n.y) }}
          className={
            "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] transition " +
            (n.state === "idle" ? "text-[#6f9bb5] opacity-80" : "text-[#a9e9ff]")
          }
        >
          <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: dot[n.state], boxShadow: n.state !== "idle" ? `0 0 10px ${dot[n.state]}` : undefined }} aria-hidden />
          {n.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire fetch + state + node render into `ConstellationClient.tsx`**

Add inside the component (above the return), and render `<ConstellationNodes .../>` inside the root div:
```tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { buildNodes, type ConstNode } from "@/lib/constellation/nodeModel";
import { placeNodes } from "@/lib/constellation/field";
import { ConstellationNodes } from "./ConstellationNodes";
import type { CatalogGroup } from "@/lib/chat/toolCatalog";
import type { ConnectorStatus } from "@/lib/connectors/types";

// inside component:
const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
const [groups, setGroups] = useState<CatalogGroup[]>([]);
const [connectors, setConnectors] = useState<{ id: string; name: string; status: ConnectorStatus }[]>([]);
const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(() =>
  typeof window !== "undefined" ? localStorage.getItem("laam:chat:agent") ?? undefined : undefined);

useEffect(() => {
  let alive = true;
  (async () => {
    const safe = async (u: string) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
    const [a, g, c] = await Promise.all([safe("/api/custom-agents"), safe("/api/chat/tools"), safe("/api/connectors")]);
    if (!alive) return;
    setAgents(a?.agents ?? []);
    setGroups(g?.groups ?? []);
    setConnectors((c?.connectors ?? []).map((x: { id: string; name: string; status: ConnectorStatus }) => ({ id: x.id, name: x.name, status: x.status })));
  })();
  return () => { alive = false; };
}, []);

const placed = useMemo(
  () => placeNodes(buildNodes({ agents, groups, connectors, selectedAgentId })),
  [agents, groups, connectors, selectedAgentId]);

const onPick = useCallback((n: ConstNode) => {
  if (n.ref.kind === "agent") {
    setSelectedAgentId(n.ref.agentId);
    localStorage.setItem("laam:chat:agent", n.ref.agentId);
  }
  // tool pick + idle-connector handling wired in Task 6 (requestedTool) / toast
}, []);
```
Render `<ConstellationNodes placed={placed} onPick={onPick} t={t} />` inside the root div.

- [ ] **Step 5: Run to verify pass** — `npx vitest run src/components/constellation/ConstellationClient.test.tsx` → PASS.

- [ ] **Step 6: Typecheck + Commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/components/constellation
git commit -m "feat(constellation): render real-data nodes (agents/tools/idle connectors) + agent select"
```

---

### Task 4: Canvas FX (radial swarm, beams, ripples, core ring)

**Files:**
- Create: `src/components/constellation/ConstellationCanvas.tsx`
- Modify: `src/components/constellation/ConstellationClient.tsx` (mount canvas behind nodes)

**Interfaces:**
- Consumes: `Placed[]` (node positions), a `getLevel: () => number` callback (0..1 audio/energy level; returns constant `0.15` until Task 5), `reduced: boolean`.
- Produces: `<ConstellationCanvas placed: Placed[]; getLevel: () => number />`.

This is a **verbatim visual port** of the prototype's canvas engine (`ennam-agent-constellation-voice.html:302–363`, the `frame()` draw loop, plus `buildSwarm`/`flows`/`spawnRipple` at :147–152, :298–300). Port those draw routines into a React component that owns its own `<canvas>` ref and `requestAnimationFrame` loop, mapping the prototype's `NODES[].px/py` to the incoming `Placed[]` (convert origin-centered `-50..50` to canvas pixels: `cx + x/50*scale`, `cy + y/50*scale`). Drive `level` from `getLevel()` each frame instead of the prototype's audio globals.

- [ ] **Step 1: Create the component skeleton with rAF + cleanup**

```tsx
"use client";
import { useEffect, useRef } from "react";
import type { Placed } from "@/lib/constellation/field";

export function ConstellationCanvas({ placed, getLevel }: { placed: Placed[]; getLevel: () => number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const placedRef = useRef(placed);
  placedRef.current = placed;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const DPR = Math.min(window.devicePixelRatio || 1, 1.6);
    let raf = 0, T = 0, W = 0, H = 0, cx = 0, cy = 0, scale = 0, coreR = 0;
    let swarm: { a: number; r: number; sp: number; ph: number; size: number }[] = [];
    const ripples: { t: number; str: number }[] = [];
    function layout() {
      W = canvas.width = innerWidth * DPR; H = canvas.height = innerHeight * DPR;
      canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
      cx = W / 2; cy = H * 0.5; scale = Math.min(W, H * 1.18) * 0.30; coreR = Math.min(W, H) * 0.115;
    }
    function buildSwarm() {
      swarm = []; const n = reduce ? 220 : Math.round(600 * (DPR > 1.2 ? 1 : 0.85));
      for (let i = 0; i < n; i++) swarm.push({ a: Math.random() * 6.28, r: Math.pow(Math.random(), 0.6), sp: Math.random() * 0.5 + 0.5, ph: Math.random() * 6.28, size: Math.random() * 1.4 + 0.5 });
    }
    layout(); buildSwarm();
    const onResize = () => { layout(); buildSwarm(); };
    addEventListener("resize", onResize);
    // PORT: prototype ennam-agent-constellation-voice.html:305–363 draw body here,
    // reading `const level = getLevel()` instead of the audio globals, and mapping
    // each placed node to px = cx + (p.x/50)*scale, py = cy + (p.y/50)*scale.
    function frame() {
      T++;
      const level = getLevel();
      ctx.clearRect(0, 0, W, H);
      // ... swarm, beams to nodes, ripples, gold core ring (verbatim port) ...
      raf = requestAnimationFrame(frame);
    }
    if (reduce) frame(); else raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", onResize); };
  }, [getLevel]);

  return <canvas ref={ref} className="absolute inset-0 z-0" aria-hidden />;
}
```

- [ ] **Step 2: Complete the `frame()` body**

Port the swarm loop, connection beams (origin→each placed node), ripple draw, inner glow, and the gold core ring from prototype lines 305–363, substituting `getLevel()` for the audio-derived `level` and `placedRef.current` for the node list. Keep colors (`#5bd6ff`, `#ffce7a`) verbatim (Style decision D3).

- [ ] **Step 3: Mount canvas behind nodes in `ConstellationClient.tsx`**

Add a level ref (constant for now) and render the canvas first (z-0), nodes second:
```tsx
const levelRef = useRef(0.15);
const getLevel = useCallback(() => levelRef.current, []);
// in JSX, before <ConstellationNodes/>:
<ConstellationCanvas placed={placed} getLevel={getLevel} />
```

- [ ] **Step 4: Verify no crash / typecheck**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run src/components/constellation/ConstellationClient.test.tsx` → PASS (jsdom lacks canvas 2d; guard: the component calls `getContext("2d")` which returns null in jsdom → add `if (!ctx) return;` after `getContext` so tests don't throw).

- [ ] **Step 5: Commit**

```bash
git add src/components/constellation
git commit -m "feat(constellation): canvas FX (swarm/beams/ripples/core) ported from prototype, level-driven"
```

---

### Task 5: Voice — `useAudioAnalyser`, `AudioWave`, wire `useVoice`

**Files:**
- Create: `src/components/constellation/useAudioAnalyser.ts`
- Create: `src/components/constellation/AudioWave.tsx`
- Modify: `src/components/constellation/ConstellationClient.tsx` (voice controls + drive canvas level)

**Interfaces:**
- Consumes: `useVoice` from `@/components/chat/useVoice`.
- Produces: `useAudioAnalyser()` → `{ ensure(): void; startMic(): Promise<void>; stopMic(): void; attachTts(el: HTMLAudioElement): void; sample(): { mic: number; tts: number } }`.

- [ ] **Step 1: Implement `useAudioAnalyser` (SSR-safe, own getUserMedia for metering)**

```ts
"use client";
import { useRef, useEffect, useCallback } from "react";

export function useAudioAnalyser() {
  const ctxRef = useRef<AudioContext | null>(null);
  const micAnalyser = useRef<AnalyserNode | null>(null);
  const ttsAnalyser = useRef<AnalyserNode | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const buf = useRef<Uint8Array>(new Uint8Array(512));
  const smooth = useRef({ mic: 0.06, tts: 0 });

  const ensure = useCallback(() => {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctxRef.current && Ctx) ctxRef.current = new Ctx();
    if (ctxRef.current?.state === "suspended") void ctxRef.current.resume();
  }, []);

  const startMic = useCallback(async () => {
    ensure();
    if (!navigator.mediaDevices?.getUserMedia || !ctxRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.current = stream;
      const src = ctxRef.current.createMediaStreamSource(stream);
      const an = ctxRef.current.createAnalyser(); an.fftSize = 512;
      src.connect(an); micAnalyser.current = an;
    } catch { /* denied → no metering; caller still shows text */ }
  }, [ensure]);

  const stopMic = useCallback(() => {
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null; micAnalyser.current = null;
  }, []);

  const attachTts = useCallback((el: HTMLAudioElement) => {
    ensure();
    if (!ctxRef.current) return;
    const src = ctxRef.current.createMediaElementSource(el);
    const an = ctxRef.current.createAnalyser(); an.fftSize = 512;
    src.connect(an); an.connect(ctxRef.current.destination); ttsAnalyser.current = an;
  }, [ensure]);

  const rms = (an: AnalyserNode | null) => {
    if (!an) return 0;
    an.getByteTimeDomainData(buf.current);
    let s = 0; for (let i = 0; i < buf.current.length; i++) { const d = (buf.current[i] - 128) / 128; s += d * d; }
    return Math.min(1, Math.sqrt(s / buf.current.length) * 3.6);
  };
  const sample = useCallback(() => {
    smooth.current.mic += (rms(micAnalyser.current) - smooth.current.mic) * 0.4;
    smooth.current.tts += (rms(ttsAnalyser.current) - smooth.current.tts) * 0.45;
    return { mic: smooth.current.mic, tts: smooth.current.tts };
  }, []);

  useEffect(() => () => { stopMic(); void ctxRef.current?.close(); }, [stopMic]);
  return { ensure, startMic, stopMic, attachTts, sample };
}
```

- [ ] **Step 2: Implement `AudioWave.tsx` (real-amplitude bars)**

Port the prototype's `drawWave()` (lines 365–378) into a canvas component driven by props:
```tsx
"use client";
import { useEffect, useRef } from "react";
type State = "idle" | "listening" | "thinking" | "speaking";
export function AudioWave({ state, sample }: { state: State; sample: () => { mic: number; tts: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state); stateRef.current = state;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const c = ref.current!; const ctx = c.getContext("2d"); if (!ctx) return;
    let raf = 0, T = 0; const bars = 46; const amp = new Array(bars).fill(0.06);
    const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    function draw() {
      T++; const { mic, tts } = sample(); const st = stateRef.current;
      const w = c.width, h = c.height, mid = h / 2; ctx.clearRect(0, 0, w, h); const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const dist = Math.abs(i - bars / 2) / (bars / 2);
        let tgt = 0.05 + 0.035 * Math.sin(T * 0.05 + i);
        if (st === "speaking") tgt = 0.10 + (0.30 + tts * 0.85) * (1 - dist * 0.7) * Math.abs(0.5 * Math.sin(T * 0.5 + i * 0.8) + 0.5);
        else if (st === "listening") tgt = 0.08 + (1 - dist) * Math.max(mic, 0.1) * 1.2;
        amp[i] += (tgt - amp[i]) * (st === "speaking" ? 0.5 : 0.35);
        const bh = Math.max(2, amp[i] * h);
        ctx.fillStyle = `rgba(255,206,122,${0.5 + amp[i] * 0.5})`;
        ctx.fillRect(i * bw + 1, mid - bh / 2, bw - 2, bh);
      }
      raf = requestAnimationFrame(draw);
    }
    if (reduce) draw(); else raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sample]);
  return <canvas ref={ref} width={320} height={48} className="block" aria-hidden />;
}
```

- [ ] **Step 3: Wire voice into `ConstellationClient.tsx`**

- Instantiate `const voice = useVoice({ lang, onTranscript: (txt) => setCommand((p) => (p ? `${p} ${txt}` : txt)) });`
- Instantiate `const audio = useAudioAnalyser();`
- Derive `state: State` from `voice.listening`/`voice.speaking`/streaming (streaming set in Task 6).
- Replace the constant `levelRef` with a `getLevel` that reads `audio.sample()`: `const getLevel = useCallback(() => { const { mic, tts } = audio.sample(); const st = ...; return Math.max(0.06, st === "listening" ? mic : st === "speaking" ? tts * 0.95 : 0.15); }, [audio]);`
- Voice toggle button: on enable → `audio.ensure(); await audio.startMic(); voice.startListening();` on disable → `voice.stopListening(); audio.stopMic(); voice.cancelSpeak();`
- Render `<AudioWave state={state} sample={audio.sample} />` + a state label (`t("constellation.stateListening")` etc.) — only when `voice.support.recognition || voice.support.synthesis`.

- [ ] **Step 4: Typecheck + run client test**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run src/components/constellation/ConstellationClient.test.tsx` → PASS (jsdom has no AudioContext/getUserMedia; the guards return early — add a test that voice UI is hidden when `window.SpeechRecognition`/`speechSynthesis` are undefined).

- [ ] **Step 5: Commit**

```bash
git add src/components/constellation
git commit -m "feat(constellation): audio-reactive voice (useAudioAnalyser + AudioWave) wired to useVoice"
```

---

### Task 6: Chat wiring — `useConstellationChat` + `CommandDock` + write-gate chip

**Files:**
- Create: `src/components/constellation/useConstellationChat.ts`
- Test: `src/components/constellation/useConstellationChat.test.ts`
- Create: `src/components/constellation/CommandDock.tsx`
- Modify: `src/components/constellation/ConstellationClient.tsx` (command send, caption, speak, tool-pick → requestedTool)

**Interfaces:**
- Consumes: `splitFrames` from `@/lib/chat/frames`.
- Produces: `useConstellationChat({ onText, onPendingWrite })` → `{ send(opts): Promise<void>; streaming: boolean; confirm(token, approve): Promise<void> }`.

- [ ] **Step 1: Write failing test for stream accumulation + write-gate (Rule 13 mock)**

Create `src/components/constellation/useConstellationChat.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConstellationChat } from "./useConstellationChat";

const SEP = "\x1e";
function streamResponse(chunks: string[]) {
  const enc = new TextEncoder();
  let i = 0;
  return { ok: true, headers: new Headers({ "x-conversation-id": "c1" }),
    body: { getReader: () => ({ read: async () => i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true, value: undefined } }) } } as unknown as Response;
}

describe("useConstellationChat", () => {
  it("accumulates streamed assistant text (ignoring frames) and reports done", async () => {
    // Rule 13: server may alter/prefix text between frames; we accumulate exactly what streams.
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(["Xin ", `${SEP}{"t":"tokens","i":5,"o":9}${SEP}`, "chào"])));
    const texts: string[] = [];
    const { result } = renderHook(() => useConstellationChat({ onText: (t) => { texts.push(t); }, onPendingWrite: () => {} }));
    await act(async () => { await result.current.send({ message: "hi", model: "gemma4:e4b" }); });
    expect(texts.at(-1)).toBe("Xin chào");
  });

  it("surfaces a pending_write frame instead of speaking it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([`${SEP}{"t":"pending_write","token":"TOK","tool":"trello_create_card","title":"Create","summary":"..."}${SEP}`])));
    const pw = vi.fn();
    const { result } = renderHook(() => useConstellationChat({ onText: () => {}, onPendingWrite: pw }));
    await act(async () => { await result.current.send({ message: "make a card", model: "gemma4:e4b" }); });
    expect(pw).toHaveBeenCalledWith(expect.objectContaining({ token: "TOK", tool: "trello_create_card" }));
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/components/constellation/useConstellationChat.test.ts` → FAIL.

- [ ] **Step 3: Implement `useConstellationChat.ts`**

```ts
"use client";
import { useCallback, useRef, useState } from "react";
import { splitFrames } from "@/lib/chat/frames";

type PendingWrite = { token: string; tool: string; title: string; summary: string };
type SendOpts = { message: string; model: string; customAgentId?: string; requestedTool?: { name: string; args: unknown } };

export function useConstellationChat({ onText, onPendingWrite }: { onText: (full: string) => void; onPendingWrite: (pw: PendingWrite) => void }) {
  const [streaming, setStreaming] = useState(false);
  const convId = useRef<string | undefined>(undefined);

  const consume = useCallback(async (body: Record<string, unknown>) => {
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, conversationId: convId.current }) });
      convId.current = res.headers.get("x-conversation-id") ?? convId.current;
      const reader = res.body!.getReader(); const dec = new TextDecoder(); let raw = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        raw += dec.decode(value, { stream: true });
        const { text, frames } = splitFrames(raw);
        onText(text);
        for (const f of frames) if (f.t === "pending_write") onPendingWrite(f as unknown as PendingWrite);
      }
      const fin = splitFrames(raw); onText(fin.text);
    } finally { setStreaming(false); }
  }, [onText, onPendingWrite]);

  const send = useCallback((opts: SendOpts) => consume(opts as Record<string, unknown>), [consume]);
  const confirm = useCallback((token: string, approve: boolean) => consume({ confirm: { token, approve } }), [consume]);
  return { send, confirm, streaming };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/components/constellation/useConstellationChat.test.ts` → PASS.

- [ ] **Step 5: Implement `CommandDock.tsx`** (chat toggle + input + send + caption)

```tsx
"use client";
import { useState } from "react";
import type { Translator } from "@/i18n/types";
export function CommandDock({ t, caption, onSend }: { t: Translator; caption: string; onSend: (msg: string) => void }) {
  const [open, setOpen] = useState(false); const [v, setV] = useState("");
  const submit = () => { if (v.trim()) { onSend(v.trim()); setV(""); } };
  return (
    <>
      <div className="absolute bottom-40 left-1/2 z-10 -translate-x-1/2 text-center text-[14px] text-[#dcefff]">{caption}</div>
      {open && (
        <div className="absolute bottom-20 left-1/2 z-20 flex w-[min(540px,86vw)] -translate-x-1/2 items-center gap-2 rounded-3xl border border-[#5bd6ff]/30 bg-[#08182a]/90 px-4 py-1">
          <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={t("constellation.commandPlaceholder")} className="flex-1 bg-transparent py-3 text-white outline-none" />
          <button onClick={submit} className="rounded-2xl bg-[#5bd6ff]/20 px-3 py-2 text-xs text-[#a9e9ff]">{t("constellation.send")}</button>
        </div>
      )}
      <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
        <button onClick={() => setOpen((o) => !o)} className="rounded-3xl border border-[#5bd6ff]/20 bg-[#0a1e34]/60 px-4 py-3 text-[13px] text-[#a9e9ff]">{t("constellation.chat")}</button>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Wire into `ConstellationClient.tsx`**

- `const [caption, setCaption] = useState("");`
- `const chat = useConstellationChat({ onText: setCaption, onPendingWrite: setPendingWrite });`
- `onSend = (msg) => chat.send({ message: msg, model: settingsModel, customAgentId: selectedAgentId, requestedTool });`
- On tool node pick (Task 3 `onPick`), set `requestedTool = { name: (n.ref.tool ?? n.ref.group.tools[0]).name, args: {} }` and a focused-group visual.
- After `chat.streaming` goes true→false, call `voice.speak(caption)` if voice enabled (or neural via Task 8).
- Render a minimal pending-write confirm chip: approve → `chat.confirm(pendingWrite.token, true)`, deny → `chat.confirm(pendingWrite.token, false)`.
- Get `settingsModel` from `localStorage` key the chat uses (`laam:chat:model` — verify in ChatClient) or default to the app default; if unsure, omit `model` (server defaults apply).

- [ ] **Step 7: Typecheck + tests + Commit**

Run: `npx tsc --noEmit` → clean. `npx vitest run src/components/constellation` → PASS.
```bash
git add src/components/constellation
git commit -m "feat(constellation): real /api/chat command + voice replies + write-gate confirm chip"
```

---

### Task 7: Sysinfo panel — greeting, facts, real weather

**Files:**
- Create: `src/app/api/weather/route.ts`
- Test: `src/app/api/weather/route.test.ts`
- Create: `src/components/constellation/SysInfoPanel.tsx`
- Modify: `src/components/constellation/ConstellationClient.tsx` (mount panel)

**Interfaces:**
- Produces: `GET /api/weather?lat=&lng=` → `{ tempC: number; code: number }`; `<SysInfoPanel greetingName; t; lang />`.
- Consumes: existing `GET /api/reverse?lat=&lng=` (city name); Open-Meteo (`https://api.open-meteo.com/v1/forecast?...&current=temperature_2m,weather_code`).

- [ ] **Step 1: Write failing test for the weather route**

Create `src/app/api/weather/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

describe("GET /api/weather", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("400s on missing coords", async () => {
    const res = await GET(new Request("http://x/api/weather"));
    expect(res.status).toBe(400);
  });
  it("maps Open-Meteo current weather to {tempC, code}", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ current: { temperature_2m: 31.4, weather_code: 3 } }) }) as Response));
    const res = await GET(new Request("http://x/api/weather?lat=10.7&lng=106.7"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tempC: 31, code: 3 });
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/app/api/weather/route.test.ts` → FAIL.

- [ ] **Step 3: Implement the route (session-gated, no key, fail-soft)**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "bad coords" }, { status: 400 });
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error("upstream");
    const j = await r.json();
    return NextResponse.json({ tempC: Math.round(j.current.temperature_2m), code: j.current.weather_code });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
```
Add `"/api/weather"` note: it stays protected (not added to the public list). Confirm `auth()` import path matches other routes.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/app/api/weather/route.test.ts` → PASS.

- [ ] **Step 5: Implement `SysInfoPanel.tsx`** (greeting + rotating facts + geo weather)

```tsx
"use client";
import { useEffect, useState } from "react";
import type { Translator, Lang } from "@/i18n/types";

const wxLabel = (code: number): string => code === 0 ? "constellation.wxClear" : code <= 3 ? "constellation.wxCloud" : code <= 48 ? "constellation.wxFog" : code <= 67 ? "constellation.wxRain" : code <= 77 ? "constellation.wxSnow" : code <= 82 ? "constellation.wxRain" : "constellation.wxStorm";

export function SysInfoPanel({ greetingName, t }: { greetingName: string; t: Translator; lang: Lang }) {
  const [wx, setWx] = useState<{ tempC: number; code: number; city: string } | null>(null);
  const [factIdx, setFactIdx] = useState(0);
  const facts = ["constellation.fact1", "constellation.fact2", "constellation.fact3"];
  const hour = new Date().getHours();
  const greet = hour < 11 ? "constellation.greetMorning" : hour < 18 ? "constellation.greetAfternoon" : "constellation.greetEvening";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const rot = reduce ? undefined : setInterval(() => setFactIdx((i) => (i + 1) % facts.length), 11000);
    const done = (lat: number, lng: number) => {
      fetch(`/api/weather?lat=${lat}&lng=${lng}`).then((r) => r.ok ? r.json() : null)
        .then(async (w) => { if (!w) return; const rev = await fetch(`/api/reverse?lat=${lat}&lng=${lng}`).then((r) => r.ok ? r.json() : null).catch(() => null); setWx({ tempC: w.tempC, code: w.code, city: rev?.city ?? rev?.name ?? "" }); })
        .catch(() => {});
    };
    navigator.geolocation?.getCurrentPosition((p) => done(p.coords.latitude, p.coords.longitude), () => done(10.7769, 106.7009), { timeout: 5000 });
    return () => { if (rot) clearInterval(rot); };
  }, []);

  return (
    <div className="absolute left-6 top-6 z-10 max-w-[330px] leading-relaxed">
      {wx && (<div className="flex items-start gap-3"><div className="text-3xl text-[#a9e9ff]">{wx.tempC}°</div><div className="mt-2 font-mono text-[9px] uppercase tracking-[2px] text-[#6f9bb5]">{wx.city}<br />{t(wxLabel(wx.code))}</div></div>)}
      <div className="mt-3 font-mono text-[10.5px] uppercase tracking-[3px] text-[#5bd6ff]">{t(greet)},<br /><b className="text-white">{greetingName || "—"}</b></div>
      <div className="mt-3 font-mono text-[8px] uppercase tracking-[2.5px] text-[#3d6480]">{t("constellation.onThisDay")}</div>
      <div className="mt-1 text-[11.5px] text-[#bcd9ec] opacity-80">{t(facts[factIdx])}</div>
    </div>
  );
}
```
(Verify the `/api/reverse` response field for city — adjust `rev?.city ?? rev?.name` to the actual shape.)

- [ ] **Step 6: Mount panel + Commit**

Add `<SysInfoPanel greetingName={greetingName} t={t} lang={lang} />` to `ConstellationClient`.
Run: `npx tsc --noEmit` → clean. `npx vitest run src/app/api/weather` → PASS.
```bash
git add src/app/api/weather src/components/constellation
git commit -m "feat(constellation): sysinfo panel — greeting, rotating facts, real geo weather (Open-Meteo)"
```

---

### Task 8: Neural-TTS proxy `/api/tts` + real-amplitude ripples on neural playback

**Files:**
- Create: `src/app/api/tts/route.ts`
- Test: `src/app/api/tts/route.test.ts`
- Modify: `src/components/constellation/ConstellationClient.tsx` (prefer `/api/tts` → analyser; fallback `voice.speak`)

**Interfaces:**
- Produces: `POST /api/tts { text, lang }` → `audio/wav` (200) or `501` when `CONSTELLATION_TTS_URL` unset.

- [ ] **Step 1: Write failing test**

Create `src/app/api/tts/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

describe("POST /api/tts", () => {
  beforeEach(() => { vi.restoreAllMocks(); delete process.env.CONSTELLATION_TTS_URL; });
  it("501s when no endpoint configured", async () => {
    const res = await POST(new Request("http://x/api/tts", { method: "POST", body: JSON.stringify({ text: "hi", lang: "vi" }) }));
    expect(res.status).toBe(501);
  });
  it("forwards to the configured endpoint and streams wav", async () => {
    process.env.CONSTELLATION_TTS_URL = "http://tts.local/say";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8), headers: new Headers({ "content-type": "audio/wav" }) }) as Response));
    const res = await POST(new Request("http://x/api/tts", { method: "POST", body: JSON.stringify({ text: "hi", lang: "vi" }) }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("audio/wav");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/app/api/tts/route.test.ts` → FAIL.

- [ ] **Step 3: Implement the proxy (session-gated, fail-soft)**

```ts
import { auth } from "@/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const endpoint = process.env.CONSTELLATION_TTS_URL;
  if (!endpoint) return new Response("tts not configured", { status: 501 });
  const { text, lang } = await req.json();
  if (!text) return new Response("no text", { status: 400 });
  try {
    const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang: lang ?? "vi" }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return new Response("tts upstream error", { status: 502 });
    return new Response(await r.arrayBuffer(), { headers: { "content-type": r.headers.get("content-type") ?? "audio/wav" } });
  } catch { return new Response("tts unavailable", { status: 502 }); }
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/app/api/tts/route.test.ts` → PASS.

- [ ] **Step 5: Prefer neural TTS in the client, meter it for ripples**

In `ConstellationClient`, add a `speak(text)` that: `POST /api/tts` → if `res.ok`, build a `Blob` → `new Audio(url)`, `audio.attachTts(el)` (Task 5), play (real amplitude → ripples); if `501`/error → `voice.speak(text)` (browser TTS, word-boundary pulse). Call this on stream-end instead of the direct `voice.speak`.

- [ ] **Step 6: Typecheck + tests + Commit**

Run: `npx tsc --noEmit` → clean. `npx vitest run src/app/api/tts src/components/constellation` → PASS.
```bash
git add src/app/api/tts src/components/constellation
git commit -m "feat(constellation): optional neural-TTS proxy /api/tts with browser-TTS fallback + metered ripples"
```

---

### Task 9: Full verification + docs + changelog

**Files:**
- Modify: `CHANGELOG.md` (add under `[Unreleased]`)
- Modify: `README.md` (mention `/constellation` + `CONSTELLATION_TTS_URL` env) — brief
- Modify: `.env.example` (add `CONSTELLATION_TTS_URL=` commented)

- [ ] **Step 1: Run the full suite + typecheck**

Run: `npx tsc --noEmit` → clean.
Run: `npm test` → Expected: all green except the 4 known `src/lib/search.test.ts` failures (unchanged, out of scope). If any OTHER test fails, fix before proceeding.

- [ ] **Step 2: Manual verification (dev server) — if the user runs it**

Checklist: `/chat` → Assistant Map → lands full-screen `/constellation` (no AppHeader); nodes show real agents + connected tool groups + idle connectors; type a command → reply streams into the caption + is spoken; (Chrome/Edge) enable voice → waveform reacts to mic; weather + greeting render; "Mở trong Chat" returns to `/chat`. Do NOT auto-start the server (ops rule) — hand this checklist to the user.

- [ ] **Step 3: Update CHANGELOG / README / .env.example**

Add a concise `[Unreleased]` CHANGELOG entry (vi) describing the page. Add `CONSTELLATION_TTS_URL` to `.env.example` (commented; unset → browser TTS).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md README.md .env.example
git commit -m "docs(constellation): changelog + env + readme for the /constellation page"
```

---

## Self-Review

**Spec coverage:** route group + auth (Task 1) ✓ · nav swap + modal removal + VoiceWave delete (Task 1) ✓ · real-data node model + states + Rule 13 (Task 2/3) ✓ · canvas FX faithful port (Task 4) ✓ · `useVoice` reuse + `useAudioAnalyser` + audio-reactive wave (Task 5) ✓ · real `/api/chat` + write-gate (Task 6) ✓ · greeting/facts/real-weather (Task 7) ✓ · neural-TTS proxy + fallback (Task 8) ✓ · i18n vi/en/zh + parity (Task 1) ✓ · matte-dark exemption noted (Global Constraints) ✓ · verification (Task 9) ✓.

**Placeholder scan:** The only deliberate "port from prototype lines X–Y" references (Task 4 canvas draw body, Task 5 `drawWave`) point at a concrete in-repo file (`ennam-agent-constellation-voice.html`) as the verbatim visual source, per Style decision D3 — not TBDs. Two "verify the actual shape" notes (`readLangFromCookie` arg, `/api/reverse` city field) are flagged for the implementer to confirm against the named file, with a working default given.

**Type consistency:** `ConstNode`/`NodeRef`/`Placed` defined in Task 2 and consumed unchanged in Tasks 3–6. `useAudioAnalyser` returns `{ ensure, startMic, stopMic, attachTts, sample }` (Task 5) and only those are called in Tasks 5/8. `useConstellationChat` returns `{ send, confirm, streaming }` (Task 6) consumed as such. `sample()` returns `{ mic, tts }` in both the hook and `AudioWave`/`getLevel` consumers.
