# LAAM Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the public `/` landing page — PS5 "Aurora" background (persistent dot layer) + a React-Three-Fiber mecha that disassembles on scroll, each part a feature, plus a secondary feature grid and a "Get started" footer. vi/en/zh, dark-only, with reduced-motion + no-WebGL fallbacks.

**Architecture:** Independent fixed layers (CSS ocean → dot canvas → vignette → transparent R3F canvas → content). `/` becomes a public route; `app/page.tsx` is a server component that reads `auth()` and renders the client `<Landing>` with `isAuthed`. The 3D canvas is `next/dynamic({ssr:false})` and lazy-mounts when the mech section nears the viewport, so Three.js never enters the hero bundle.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · `three` + `@react-three/fiber@^9` + `@react-three/drei` · in-house i18n (`useT`).

**Spec:** `docs/superpowers/specs/2026-06-08-laam-landing-page-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/app/page.tsx` (modify) | Server component: `auth()` → render `<Landing isAuthed>` (was a redirect) |
| `src/auth.config.ts` (modify) | Add `p === "/"` to `isPublic` |
| `src/auth.config.test.ts` (create) | Assert `/` authorizes when logged out |
| `src/i18n/dictionaries/landing.ts` (create) | All landing strings, vi/en/zh |
| `src/i18n/dictionaries/landing.test.ts` (create) | Every key has vi/en/zh |
| `src/components/landing/features.ts` (create) | Feature data (id, part, i18n keys, telemetry, tags) |
| `src/components/landing/Landing.tsx` (create) | `'use client'` orchestrator |
| `src/components/landing/AuroraBackground.tsx` (create) | CSS ocean/glow/vignette + dot canvas |
| `src/components/landing/useDotField.ts` (create) | The particle-canvas effect hook |
| `src/components/landing/LandingNav.tsx` (create) | Sticky nav + lang switcher + auth CTA |
| `src/components/landing/Hero.tsx` (create) | Hero copy/CTAs |
| `src/components/landing/MechShowcase.tsx` (create) | Pinned section; lazy 3D; panel reveal; fallback |
| `src/components/landing/Mech3D.tsx` (create) | R3F `<Canvas>` (dynamic, ssr:false) |
| `src/components/landing/MechModel.tsx` (create) | Procedural mech, part groups, useFrame explode |
| `src/components/landing/HudPanel.tsx` (create) | Sci-fi feature panel (no corner brackets) |
| `src/components/landing/FeatureGrid.tsx` + `FeatureCard.tsx` (create) | Secondary depth-cards |
| `src/components/landing/Footer.tsx` (create) | CTA footer |
| `src/components/landing/useScrollProgress.ts` (create) | rAF-throttled pinned progress hook |
| `src/components/landing/landing.css` (create) | Landing-scoped keyframes/utilities (imported by Landing) |

Tests colocated as `*.test.ts(x)` per repo convention (Vitest + RTL + jsdom).

---

## Phase A — Foundation

### Task A1: Add 3D dependencies

**Files:** `package.json` (modify, via npm)

- [ ] **Step 1: Install** (verify React-19-compatible versions — fiber v9+)

Run: `npm install three@^0.160 @react-three/fiber@^9 @react-three/drei@^10 && npm install -D @types/three`
Expected: added to dependencies; `npm ls @react-three/fiber` shows v9.x.

- [ ] **Step 2: Sanity typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (deps resolve).

- [ ] **Step 3: Commit**

`git add package.json package-lock.json && git commit -m "build(landing): add three + react-three-fiber + drei"`

> If `npm install` needs network outside the sandbox, run with the sandbox disabled. If fiber v9 conflicts with React 19, consult https://r3f.docs.pmnd.rs and pin the latest known-good.

### Task A2: i18n landing dictionary (TDD)

**Files:** Create `src/i18n/dictionaries/landing.ts`, `src/i18n/dictionaries/landing.test.ts`

- [ ] **Step 1: Write the failing test** (mirror `dashboard.test.ts` pattern)

```ts
import { describe, it, expect } from 'vitest';
import { landing } from './landing';

describe('landing dictionary', () => {
  it('has vi/en/zh for every key', () => {
    for (const [key, entry] of Object.entries(landing)) {
      expect(entry.vi, `${key}.vi`).toBeTruthy();
      expect(entry.en, `${key}.en`).toBeTruthy();
      expect(entry.zh, `${key}.zh`).toBeTruthy();
    }
  });
  it('covers the six core feature titles', () => {
    for (let i = 1; i <= 6; i++) expect(landing[`feat.${i}.title`]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`landing` not found)

Run: `npm test -- src/i18n/dictionaries/landing.test.ts`

- [ ] **Step 3: Implement `landing.ts`** — `export const landing: Dict = {…}` with keys:
  `nav.features|howItWorks|stack|signin|getstarted|dashboard`, `hero.eyebrow|title|titleAccent|sub|cta.primary|cta.secondary|scroll`,
  `mech.section.k|title|sub`, `feat.1..6.{title,desc,t1k,t1v,t2k,t2v,t3k,t3v,tag1,tag2}`, `grid.k|title` + `grid.<id>.{title,desc}` for the secondary set,
  `footer.title|sub|cta|note`, `a11y.*`. Each `{ vi, en, zh }`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** `git add src/i18n/dictionaries/landing.* && git commit -m "feat(landing): i18n dictionary (vi/en/zh)"`

### Task A3: Make `/` public (TDD)

**Files:** Modify `src/auth.config.ts:18`; create `src/auth.config.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { authConfig } from './auth.config';

const can = (path: string, loggedIn: boolean) =>
  authConfig.callbacks!.authorized!({
    auth: loggedIn ? ({ user: { id: '1' } } as any) : null,
    request: { nextUrl: { pathname: path } } as any,
  } as any);

describe('route protection', () => {
  it('allows the landing page when logged out', () => { expect(can('/', false)).toBe(true); });
  it('still gates the dashboard when logged out', () => { expect(can('/dashboard', false)).toBe(false); });
});
```

- [ ] **Step 2: Run — expect FAIL** on the `/` case.
- [ ] **Step 3: Implement** — add `p === "/" ||` to the `isPublic` expression.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `git add src/auth.config.* && git commit -m "feat(landing): make / a public route"`

### Task A4: Feature data module

**Files:** Create `src/components/landing/features.ts`

- [ ] **Step 1:** Define `CORE_FEATURES` (6, with `id`, `part: 'head'|'core'|'armL'|'armR'|'legL'|'legR'`, `num`, i18n key prefixes, `tags`) and `GRID_FEATURES` (~6, `id`, i18n keys). Pure data; strings come from `landing` dict via keys. No test (data only) — covered by A2 key test + component tests.
- [ ] **Step 2: Commit** `git commit -am "feat(landing): feature data model"`

---

## Phase B — Background, nav, hero

### Task B1: AuroraBackground + dot field

**Files:** Create `useDotField.ts`, `AuroraBackground.tsx`, `landing.css`

- [ ] **Step 1:** Port the **validated POC dot-field** (3-tier depth: sharp stars w/ core+halo, motes, bokeh; blue-ocean+cyan hue split; additive `'lighter'`; mouse parallax; `prefers-reduced-motion` → single static frame; DPR≤2; resize-rebuild) into `useDotField(canvasRef)`.
- [ ] **Step 2:** `AuroraBackground.tsx` renders fixed layers: `.scene` (base gradient + corner key-light), `<canvas>` (dot field, `aria-hidden`), `.vig`. z-index 0/1/2. All `pointer-events:none`.
- [ ] **Step 3:** `landing.css` holds keyframes (drift, scrollcue, reveal) + the layer classes.
- [ ] **Step 4: Render test** (`AuroraBackground.test.tsx`): mounts without throwing, canvas is `aria-hidden`. (jsdom lacks canvas 2D — guard the hook so a null context no-ops.)
- [ ] **Step 5: Commit** `git commit -m "feat(landing): aurora background + dot field"`

### Task B2: LandingNav

**Files:** Create `LandingNav.tsx`; test `LandingNav.test.tsx`

- [ ] **Step 1: Failing test** — renders **Get started + Sign in** when `isAuthed=false`; **Go to dashboard** when `true`. Use `useT(landing)`; wrap in `I18nProvider`.

```tsx
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { LandingNav } from './LandingNav';
const ui = (a: boolean) => <I18nProvider lang="en"><LandingNav isAuthed={a} /></I18nProvider>;
it('shows Get started when logged out', () => { render(ui(false)); expect(screen.getByText('Get started')).toBeInTheDocument(); });
it('shows dashboard link when logged in', () => { render(ui(true)); expect(screen.getByText('Go to dashboard')).toBeInTheDocument(); });
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — sticky `<header>`; brand mark; anchor links (`#features` etc.); language switcher (buttons calling `useLang().setLang`); CTA block branching on `isAuthed` (`/register`, `/login`, or `/dashboard`); `scroll` listener toggles an opaque `.scrolled` bg. Real `<a>`/`<button>` with focus styles.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**

### Task B3: Hero

**Files:** Create `Hero.tsx`; test optional render.

- [ ] **Step 1:** Section with eyebrow, gradient headline (`hero.title` + accent), sub, two CTAs (primary → `/register`, secondary → `/login`), scroll cue. All copy via `t()`. `id="top"`.
- [ ] **Step 2: Commit** `git commit -m "feat(landing): nav + hero"`

---

## Phase C — Mech exploded showcase

### Task C1: MechModel (R3F procedural mech)

**Files:** Create `MechModel.tsx`

- [ ] **Step 1:** `'use client'`. Build the mech from drei `<RoundedBox>` + `<mesh>` (cylinders/torus/sphere) grouped by part (`head, core, armL, armR, legL, legR, backpack, hips`). Materials: `meshStandardMaterial` steel (`metalness .92, roughness .33`), white, dark, accent (`emissive #36a6d6`, `emissiveIntensity 2.6`). Each part `<group>` gets a `ref`; store `home` + `dir` vectors (port the POC's offsets).
- [ ] **Step 2:** `useFrame` reads a shared `progress` ref (0→1, eased) and sets each group `position = home + dir·p`; gentle mouse-orbit on the parent group. Accept `progressRef` + `pointerRef` props.
- [ ] **Step 3: Commit** `git commit -m "feat(landing): procedural R3F mech model"`

### Task C2: Mech3D (Canvas wrapper)

**Files:** Create `Mech3D.tsx`

- [ ] **Step 1:** `'use client'`. `<Canvas camera={{fov:40,position:[0,0.2,10]}} gl={{alpha:true}} dpr={[1,2]} frameloop={...}>` with drei `<Environment preset="city" />` (reflections), lights (hemisphere + key upper-left + cyan rim + core point), `<MechModel>`. Accept `progressRef`, `pointerRef`, and `active` (gate `frameloop` to `'always'`/`'never'` by visibility for perf).
- [ ] **Step 2:** Export as default for `next/dynamic`. Verify `tsc`.
- [ ] **Step 3: Commit** `git commit -m "feat(landing): R3F canvas wrapper"`

### Task C3: HudPanel

**Files:** Create `HudPanel.tsx`; test render.

- [ ] **Step 1:** Port the **approved** sci-fi panel (angular `clip-path` frame wrapper, header `MOD-0x // …`, faux screenshot w/ scanline + grid, telemetry row, description, tags, conic gauge) — **without the corner reticle brackets**. Props: `feature` + `t`. Content via i18n keys.
- [ ] **Step 2: Render test** — given a feature + provider, shows its title + telemetry values.
- [ ] **Step 3: Commit** `git commit -m "feat(landing): sci-fi HUD feature panel"`

### Task C4: useScrollProgress + MechShowcase

**Files:** Create `useScrollProgress.ts`, `MechShowcase.tsx`; test fallback.

- [ ] **Step 1:** `useScrollProgress(sectionRef)` → rAF-throttled progress (0→1) across a pinned section (`-rect.top / (rect.height - innerHeight)`), written to a ref + state for panel thresholds.
- [ ] **Step 2:** `MechShowcase.tsx`: tall `.explode` wrapper + sticky 100vh stage. `const Mech3D = dynamic(() => import('./Mech3D'), { ssr: false })`. Mount it only when the section is near viewport (IntersectionObserver → `active`). Render the 6 `HudPanel`s positioned around the stage, revealed as progress crosses each `feat.at`. Feed `progressRef`/`pointerRef`.
- [ ] **Step 3: Fallback** — detect no-WebGL (`!window.WebGLRenderingContext` or a context probe) OR `prefers-reduced-motion` → render a static stacked list of all 6 `HudPanel`s (no canvas). **Test** (`MechShowcase.test.tsx`): with WebGL mocked absent, the 6 feature titles are in the DOM (content reachable).
- [ ] **Step 4: Run tests — PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(landing): pinned mech exploded-view showcase + fallback"`

---

## Phase D — Secondary grid, footer, assembly

### Task D1: FeatureGrid + FeatureCard

**Files:** Create `FeatureCard.tsx`, `FeatureGrid.tsx`; test renders all.

- [ ] **Step 1:** `FeatureCard` = depth-card (`opacity:0; transform:translateZ(-320px) rotateX(22deg)` → `.in` via IntersectionObserver). `FeatureGrid` maps `GRID_FEATURES`. Copy via `t()`.
- [ ] **Step 2: Test** — renders every `GRID_FEATURES` title.
- [ ] **Step 3: Commit.**

### Task D2: Footer

**Files:** Create `Footer.tsx`

- [ ] **Step 1:** CTA band — `footer.title`, `footer.sub`, primary "Get started" → `/register`, brand + `footer.note` ($0 / local). `id` anchors.
- [ ] **Step 2: Commit** `git commit -m "feat(landing): secondary grid + footer"`

### Task D3: Landing orchestrator + route

**Files:** Create `Landing.tsx`; modify `src/app/page.tsx`; test page.

- [ ] **Step 1:** `Landing.tsx` (`'use client'`) composes `<AuroraBackground/> <LandingNav isAuthed/> <main> <Hero/> <MechShowcase/> <FeatureGrid/> <Footer/> </main>`, imports `landing.css`, owns the shared `pointerRef` (one `mousemove` listener).
- [ ] **Step 2:** `app/page.tsx`:

```tsx
import { auth } from '@/auth';
import { Landing } from '@/components/landing/Landing';
export default async function Home() {
  const session = await auth();
  return <Landing isAuthed={!!session?.user} />;
}
```

- [ ] **Step 3: Test** (`page.test.tsx` or via Landing) — composed tree renders hero title + a mech feature + a grid feature + footer CTA. (Mock `auth` if testing the page directly.)
- [ ] **Step 4: Commit** `git commit -m "feat(landing): assemble page at / (auth-aware)"`

---

## Phase E — Verify

### Task E1: Typecheck + unit tests
- [ ] Run: `npx tsc --noEmit` → clean.
- [ ] Run: `npm test` → all green (new + existing ≥1170).

### Task E2: Production build (guarded)
- [ ] If prod is NOT running on the host, run `npm run build` → succeeds; confirm Three.js is a **separate lazy chunk** (not in the main/hero entry). If prod IS running, skip and note (repo rule: no in-place build while prod runs).

### Task E3: Runtime/visual verification (NEEDS USER PERMISSION)
- [ ] Repo rule: do not start the dev server without the user's OK. When granted: `npm run dev` (:3100), open `/`, verify: dots + mech coexist, scroll disassembles the mech with panels, nav CTA matches auth, lang switch reflows, reduced-motion + no-WebGL fallbacks. Capture screenshots for the report.

---

## Success Criteria

- `/` renders for logged-out **and** logged-in (correct CTA), no auth redirect.
- Dot layer + 3D mech coexist; scroll disassembles the mech mapping 6 features; secondary grid shows the rest.
- Reduced-motion + no-WebGL fallbacks keep **all** feature text reachable (tested).
- vi/en/zh complete (tested); language switch reflows.
- `tsc` clean; `npm test` green; build succeeds with Three.js in a lazy chunk.

## Self-Review (done)

- **Spec coverage:** background (B1), mech/explode (C1–C4), HUD panels (C3), routing (A3,D3), i18n (A2), secondary grid (D1), footer (D2), a11y/fallbacks (B1,C4), deps/perf (A1,C2,C4). ✔ All spec sections map to a task.
- **Placeholders:** none — testable tasks carry real test code; presentational tasks port the *validated* POC code (proven in brainstorming).
- **Type consistency:** part ids (`head|core|armL|armR|legL|legR`) shared across `features.ts`, `MechModel`, `MechShowcase`; `progressRef`/`pointerRef`/`active` consistent C1↔C2↔C4; `isAuthed` consistent D3↔B2.
