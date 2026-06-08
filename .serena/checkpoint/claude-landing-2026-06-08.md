# Checkpoint: claude (landing page) — 2026-06-08

## What was done
- Brainstormed (visual companion) → spec → plan → **built** the public landing page at `/`:
  PS5 "Aurora" background (blue-ocean + cyan, persistent dot/particle layer) + a
  React-Three-Fiber **mecha that disassembles on scroll**, each part a feature, with
  sci-fi HUD panels. Phases A–D complete; E1 verified.

## Files changed (all committed on `feat/landing-page`)
- `docs/superpowers/specs/2026-06-08-laam-landing-page-design.md` + `plans/2026-06-08-laam-landing-page.md`
- `package.json` / lock — `three` + `@react-three/fiber@9` + `@react-three/drei@10`
- `src/auth.config.ts` (+`/` public) + `auth.config.test.ts`
- `src/i18n/dictionaries/landing.ts` (+test, vi/en/zh)
- `src/components/landing/*` — features, AuroraBackground+useDotField, LandingNav, Hero,
  HudPanel, MechModel, Mech3D, useScrollProgress, MechShowcase, FeatureCard, FeatureGrid,
  Footer, Landing, landing.module.css (+ tests)
- `src/app/page.tsx` — redirect→landing (auth-aware via `auth()`)

## Current state
- ✅ `tsc --noEmit` clean (exit 0); ✅ **1272 tests pass** (incl. 9 new landing).
- ⏳ NOT run (host rules): `next build` + dev server — runtime/visual UNVERIFIED.
- Landing is **dark-only** by design (spec §13) — flagged for user confirmation.

## Next steps
- With user OK: `npm run build` (confirm Three.js is a lazy chunk, not in hero entry) +
  `npm run dev` (:3100) visual check — dots+mech coexist, scroll disassembles, lang switch,
  reduced-motion + no-WebGL fallbacks — capture screenshots.
- Later: real feature screenshots into HUD panels; mech redesign ("good enough" placeholder).

## Blockers / Risks
- **SHARED checkout** with other teams. Staged ONLY my files every commit; never touched the
  workflow team's WIP (WorkflowEditor/NodesLibraryPanel/RunWaterfall). See memory
  `shared-workspace-no-branch-switch`. Branch `feat/landing-page` is shared by 3 teams; user
  merges the combined result to `main` later.
- R3F×React19 pinned: fiber 9.6.1 / drei 10.7.7 / three 0.184 (verified clean).
