# Design — LAAM public landing page ("the platform, embodied")

**Date:** 2026-06-08 · **Status:** awaiting user review · **Author:** main session (with user, via visual-companion brainstorming)

## 1. Goal

A public marketing/showcase home page for LAAM that presents **all the
platform's features** in a single premium, animated scroll experience —
PS5-grade ambiance, a 3D mecha that disassembles on scroll with each part
explaining one feature. It is the front door at `/` for everyone.

Non-goals: changing any existing app page; real feature screenshots (placeholders
now); a final/"hero-grade" mech sculpt (current procedural mech is "good enough,
redesign later").

## 2. Decisions locked (during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| Background | PS5 "Aurora" stack | Dark-blue-**ocean** primary + **cyan** accent. Persistent **dot/particle layer** kept as its own global layer. |
| Centerpiece | How features reveal | A **3D mecha**, centered, **disassembles on scroll** (exploded view); each part = one feature, with a sci-fi HUD panel. |
| 3D approach | Realistic model that separates | **Real-time React Three Fiber** (Three.js). Mech built **procedurally in code** (option ③) — PBR metal + emissive cyan, fully separable. **Original mecha-style** (not Gundam — IP-safe). |
| Mech layering | Keep dots | Mech is a **separate transparent WebGL layer on top of** the persistent dot layer. The two never couple (independent loops) → mech can be redesigned later without touching the background. |
| HUD panels | Feature callouts | **Sci-fi** angular frame, **telemetry + a feature screenshot**, status gauge. **No corner reticle brackets** (removed per feedback). |
| Routing | Where it lives | **`/` for everyone, no redirect.** Logged-in users see a **"Go to dashboard"** button in the nav; logged-out see Get started / Sign in. |
| i18n | Languages | **Full vi / en / zh** (project convention) — new `landing` dictionary. |
| CTA | Primary action | **Open "Get started"** → `/register` (first user = owner) + **"Sign in"** → `/login`. |
| Theme | Light/dark | Landing is **dark-only** (the PS5 ocean aesthetic depends on darkness). It uses its own fixed palette, independent of the app's theme toggle. *(Flagged for confirmation — §13.)* |

Validated interactively in the visual companion: background tint (v4), the
exploded-view mechanic, the sci-fi HUD panel, and a **working Three.js mech POC**
(renders + explodes + coexists with the dots; verified console-clean in a headless
Chrome).

## 3. Layer architecture

The page is a stack of independent fixed layers behind scrolling content. Each
layer is self-contained and can be restyled or replaced in isolation:

```
z0  CSS ocean base gradient + corner key-light            (cheap, static-ish)
z1  Dot/particle Aurora canvas  ← persistent, never coupled to the mech
z2  Vignette (cinematic edge darkening)
z3  Mech WebGL canvas (R3F, alpha:true → transparent)     ← its own layer/section
z4+ Content: nav, hero copy, HUD panels, feature grid, footer
```

- The dot canvas (`AuroraBackground`) and the mech canvas (`Mech3D`) run **two
  separate animation loops**; neither imports the other. This is the literal
  implementation of "keep the dots, mech in a separate session."
- Mouse parallax is shared only via the global pointer position (each layer reads
  it independently).

## 4. Page structure (top → bottom)

1. **Sticky nav** (`LandingNav`) — LAAM mark · anchor links (Features / How it works
   / Stack) · **language switcher** (vi/en/zh) · auth-aware CTA (logged-out:
   *Get started* + *Sign in*; logged-in: *Go to dashboard*). Gains an opaque
   matte background on scroll.
2. **Hero** (`Hero`) — pure Aurora dots; eyebrow "Local AI Agent Monitoring",
   headline, subline, CTAs, animated scroll cue.
3. **The Mech** (`MechShowcase`) — pinned section; the 3D mech disassembles across
   the scroll, 6 core features revealed as parts with `HudPanel`s + leader lines.
4. **Secondary feature grid** (`FeatureGrid`) — the remaining features as 3D
   "depth cards" (rise-from-depth on scroll via IntersectionObserver).
5. **Footer / CTA** (`Footer`) — final "Get started", brand, links, "$0 local /
   open-source" note.

## 5. Feature inventory (the "whole platform")

**Mech parts (6 core — each a HUD panel):**

| # | Part | Feature | One-liner |
|---|------|---------|-----------|
| 1 | Head / optics | Real-time agent monitoring | Live status/runtime/current-task over SSE |
| 2 | Reactor core | Local AI chat ($0) | Multimodal GPU assistant (Ollama) + tools |
| 3 | Left arm | Connectors | GitHub/Jira/Trello/Google, encrypted per-user |
| 4 | Right arm | Workflow orchestration | Chain agents + connectors as nodes |
| 5 | Left leg | Multi-machine | Zero-dep collector streams every dev box |
| 6 | Right leg | Dashboard & insights | Cost/tokens/tool-leaderboard |

**Secondary grid (the rest):** Agent graph (orchestrator→sub-agent, xyflow) ·
Auth + RBAC (owner/admin/member/viewer) · Local-first & $0 (no cloud bill) ·
Audit log · OCR / vision · i18n (vi/en/zh) · World-tools (web search/read,
calc, self-introspection). *(Final selection trimmed during implementation;
target ~6 cards so the page stays focused.)*

## 6. The 3D mech (React Three Fiber)

- **Build:** procedural mecha from `RoundedBoxGeometry` + cylinders/torus, grouped
  by part. `MeshStandardMaterial` (metalness ≈ 0.9), an env map from
  `RoomEnvironment` (PMREM) for reflections, `ACESFilmicToneMapping`. Emissive
  cyan visor/reactor/trims. Key light upper-left (matches the corner light) + cyan
  rim + core point-light.
- **Explode mechanic:** one scroll-progress value `p` (0→1) drives every part:
  `position = home + direction × p`, `p` eased toward its scroll target for glide.
  Same formula proven in the POC, now in `Vector3` space.
- **Camera:** subtle mouse-orbit; slight extra rotation as it explodes to show depth.
- **Render-gating (perf):** only render the WebGL loop while the section is in/near
  the viewport (IntersectionObserver); pause otherwise. DPR capped at 2.

## 7. Components & files

New, under `src/components/landing/` unless noted:

- `Landing.tsx` (`'use client'`) — orchestrator; receives `isAuthed` from the page.
- `AuroraBackground.tsx` — CSS ocean/glow/vignette + the **dot/particle canvas** (z0–z2).
- `LandingNav.tsx` — sticky nav + language switcher (`useLang`) + auth-aware CTA.
- `Hero.tsx` — hero copy/CTAs.
- `MechShowcase.tsx` — pinned section; lazy-mounts the 3D canvas; owns scroll
  progress + HUD panel reveal; renders the **fallback** when 3D is unavailable.
- `Mech3D.tsx` — the R3F `<Canvas>` (loaded via `next/dynamic`, `ssr:false`).
- `MechModel.tsx` — the procedural mech (memoized geometry, part groups).
- `HudPanel.tsx` — sci-fi feature panel (telemetry + screenshot slot + gauge).
- `FeatureGrid.tsx` + `FeatureCard.tsx` — secondary depth-cards.
- `Footer.tsx` — CTA footer.
- `features.ts` — feature data (id, part, i18n key refs, telemetry, tags) shared by
  panels + grid. Strings live in i18n, not here.
- `useScrollProgress.ts` — rAF-throttled pinned-section progress hook.

Edited:

- `src/app/page.tsx` — replace `redirect("/dashboard")` with a **server component**
  that reads `auth()` and renders `<Landing isAuthed={!!session} />`.
- `src/auth.config.ts` — add `p === "/"` to the `isPublic` list (so the root is
  reachable logged-out). *(Documented gotcha: public routes must be added here.)*
- `src/i18n/dictionaries/landing.ts` (+ `landing.test.ts`).

Assets:

- `public/landing/mech-exploded.webp` — pre-rendered static fallback (exploded mech)
  for no-WebGL / reduced-motion. *(Produced from the POC or a one-off render;
  until then the fallback is the accessible HUD-panel list with no image.)*

## 8. Dependencies

Add: `three`, `@react-three/fiber`, `@react-three/drei`.

- **React 19 compatibility is a hard check:** use `@react-three/fiber@^9` (the
  first major with React 19 support) and a matching `@react-three/drei`. Verify
  exact versions against their docs at install (Rule: don't assume).
- Three.js (~150 KB gz) is shipped only in the **lazy chunk** for `Mech3D`
  (dynamic import) — it must not enter the hero/initial bundle.

## 9. Performance

- 3D canvas dynamically imported (`ssr:false`) and mounted only when the mech
  section nears the viewport → hero is light; Three.js loads on scroll intent.
- Pause the render loop when the mech section is offscreen.
- Scroll work is one rAF-gated handler writing CSS vars / `p`; only `transform`/
  opacity animate (compositor-friendly). No layout thrash.
- DPR cap 2; particle count scales to viewport area (already tuned).
- Respect the host's "no background services" rule — verification runs only when
  the user is hosting dev (`:3100`).

## 10. Accessibility (hard project constraint)

- **`prefers-reduced-motion`:** dots freeze (single static frame), mech renders
  **assembled & still** (or the static exploded image), no parallax/auto-rotate;
  feature panels are shown as a normal, fully-readable stacked list.
- **No WebGL / context fails:** `MechShowcase` catches and renders the static
  fallback — the **feature list as real semantic HTML** (the exploded view is a
  progressive enhancement, never the only way to read a feature).
- All decorative canvas/glow layers are `aria-hidden`. Every feature's title +
  description exists as headings/paragraphs for screen readers regardless of the 3D.
- Keyboard: nav + CTAs are real `<a>`/`<button>` with visible focus rings.
- Contrast: light text (`#e8f1fb`) on deep-navy meets WCAG AA; verify each panel.

## 11. Responsive

- **< md:** drop the pinned 3D explode. Show a single static/looped mech (or the
  fallback image) and stack the 6 HUD panels vertically; secondary grid → 1 column.
  (3D pinned-scroll is too heavy + cramped on phones.)
- **md+:** full experience.

## 12. Testing (Vitest + RTL)

- `landing.test.ts` — every key has vi/en/zh (mirrors existing dictionary tests).
- `auth.config` — `authorized()` returns `true` for `/` when logged out (route is public).
- `Landing`/`LandingNav` — renders **Get started/Sign in** when `isAuthed=false`,
  **Go to dashboard** when `true`.
- `MechShowcase` — renders the accessible fallback feature list when WebGL is
  unavailable (mock), proving the no-WebGL path keeps content reachable.
- `FeatureGrid` — renders all configured features.
- The R3F canvas itself is not unit-tested (WebGL in jsdom); covered by manual
  preview verification.

## 13. Next 16 specifics & open risks

- **Read `node_modules/next/dist/docs/` before coding** (per CLAUDE.md — "This is
  NOT the Next.js you know"): App Router server/client boundaries, `next/dynamic`
  `ssr:false`, metadata. `page.tsx` stays a server component (calls `auth()`);
  everything animated is client.
- **Risk — R3F × React 19 version compat:** verify at install; fallback plan is
  pinning known-good versions.
- **Risk — global ambient overlap:** `globals.css` paints `body::before/::after`
  (grid + ambient) at negative z; the landing's own opaque base covers them, but
  confirm no double-glow on `/`.
- **Risk — dark-only landing vs "light mode kept functional":** the landing is
  intentionally dark-fixed. **Confirm acceptable** (it's a hero page; a light PS5
  ocean makes no sense). If light is required, we add a light variant later.
- **Risk — mech quality:** procedural mech is "good enough" for v1; isolated layer
  allows a later swap to a sculpted GLB with no other changes.

## 14. Success criteria

- `/` renders the landing for **both** logged-out and logged-in users (correct CTA),
  **no auth redirect**.
- Dot layer + 3D mech coexist; mech disassembles on scroll mapping the 6 core
  features; secondary grid shows the rest. Reduced-motion + no-WebGL fallbacks work
  and keep all feature text reachable.
- vi/en/zh complete; language switcher reflows copy.
- `npm test` green (new + existing ≥1170), `tsc` clean, `next build` succeeds, and
  Three.js is absent from the initial bundle (lazy chunk only).

## 15. Out of scope / future

- Real LAAM feature screenshots (swap into HUD panels later).
- Mech redesign / sculpted GLB.
- Extra narrative sections, video, testimonials.
- Light-mode landing variant (only if required).
