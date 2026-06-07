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

## Next (rollout, future sessions)
Cuốn chiếu primitives → pages: Dashboard → Agents → Chat → Connectors/Graph/
Machines. Repoint legacy `--color-accent` + chart theming (`useChartTheme`) to
the new accent. Remove `/ui-preview`. Primitives are presentational → no i18n
keys needed (only add keys when restyling pages introduces strings).
