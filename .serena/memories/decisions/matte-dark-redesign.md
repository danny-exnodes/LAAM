# Decision: Platform redesign — "Matte Dark" (NOT glassmorphism)

**Date:** 2026-06-07 · **Branch:** `claude/platform-glass-design-redesign-BADTM`

## Direction (locked with user)
Big visual upgrade inspired by Apple-style dark UI reference shots (FundedX /
POV presale). User explicitly **dropped literal glassmorphism**: NO
translucency / NO `backdrop-blur`. Final language = **Matte Dark**:
- Opaque, low-saturation **matte** surfaces (no gloss — "không chói mắt").
- Depth from **ambient gradient + decorative bloom**, not frosted glass.
- Accent **`#36a6d6` (cyan-blue)** replacing legacy purple `#6d5efc`.
- Base `#001616`; cool cyan/aqua tones.
- **a11y is a HARD constraint** (WCAG contrast floors, focus rings, respects
  `prefers-reduced-motion`).
- Light mode kept **functional** (token re-map at `:root`) but dark is the
  design focus.

## Why not glass (push-back that the user accepted)
LAAM is data-dense (tables/transcripts/recharts/leaflet/xyflow). Glass+blur on
that surface hurts contrast + perf + needs `prefers-reduced-transparency`
fallback — conflicts with the hard a11y constraint. ~80% of the reference "wow"
is bloom+gradient+matte, not the translucency, so we keep that and drop blur.

## What was built (foundation only — pages NOT touched yet)
Rollout choice = **token + primitives first, no page redesign this pass**.
- `src/app/globals.css`: Matte Dark token layer (`--bg-base`, `--surface-1..3`,
  `--border-subtle/strong`, `--text-primary/secondary/muted`, `--accent*`,
  `--bloom-*`) under `:root` (light) + `.dark` (designed). Ambient `body::after`
  retuned blue→cyan/aqua. Legacy `--color-accent` left UNTOUCHED (pages keep
  current look until rolled out).
- `src/components/ui/`: `MatteCard` (opaque, optional `bloom` slot, NO blur),
  `Bloom` (decorative aria-hidden + pointer-events-none radial glow, rides
  `.anim-glow`), `MatteButton` (matte accent fill + mandatory focus-visible
  ring), `index.ts` barrel.
- `src/app/ui-preview/page.tsx`: **TEMPORARY** throwaway gallery (forces
  `.dark`). Delete once look&feel signed off + real pages restyled.
- Tests `src/components/ui/ui.test.tsx` (8) guard the decisions: card has NO
  `backdrop-blur`, bloom never traps clicks, button always has focus ring.

Verified: 1125 tests pass, tsc clean. Contrast self-checked (primary 14.4:1,
secondary 7.9:1, muted 4.6:1, accent-fill text 6.8:1 on `--surface-1`).

## ROLLOUT DONE — applied app-wide (2026-06-07, user said "apply toàn bộ")
Done via a **token-level lever**, NOT 135 hand-edits (Rule 2/3):
- `@theme` retints the whole **`neutral` scale** (~950 usages = the entire
  surface/border/text system) to a teal family, **lightness preserved per step**
  so contrast ratios are unchanged; dark end (800/900/950) aligned to
  `--surface-*`/`--bg-base` so legacy `dark:bg-neutral-900` == `<MatteCard>`.
- `--color-accent` repointed `#6d5efc`→`#36a6d6`; the 18 hardcoded `#6d5efc`
  swapped across charts/`metric-colors`; `ram` `#8b5cf6`→`#2dd4bf` (aqua);
  workflow `connector` node `#7c3aed`→cyan; AuthShell violet/indigo→cyan.
- **Left intentionally**: 10-hue categorical chart palettes (ChartBlock/
  Doughnut/TrendChart) keep warm hues — they're data encodings; forcing
  monochrome-cool hurts legibility. Surfaced to user.
- a11y verified (WCAG): primary 17:1/14.6:1, secondary 8.04/8.12:1 (light/dark —
  numbers corrected 2026-06-11 per QA A4 live measurement; both pass), muted-500
  4.9:1 light / 3.47 dark-tertiary (≥ pre-redesign). 1125 tests green, tsc clean.

## Residual / future
- `/ui-preview` kept as a living style gallery (can delete anytime).
- Known-minor: `--color-accent` is a single value → accent-as-text on white in
  light mode = 2.77:1 (accent is used as fills/inline chart colors, not body
  text, so low impact). The new primitives use mode-aware `--accent` (#2a8fbf
  in light) which is fine.
- **2026-06-11 (QA A1):** FIXED — light accent darkened to `#1f6f96` (5.57:1 on white, ≥4.5:1 on all light surfaces); dark keeps `#36a6d6` via `.dark` override.
- Optional polish later: sprinkle `<Bloom>` on hero areas (dashboard KPI/auth),
  recolor categorical chart palettes if desired, MatteCard adoption in new code.
- Primitives are presentational → no i18n keys needed.
