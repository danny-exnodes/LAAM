# Matte Dark QA — UI/a11y findings (E2E 2026-06-08, batch HEAD 00aba41)

Live **verify-not-prose** on :8443 (logged-in Chrome): DOM `getComputedStyle` + in-page WCAG
contrast calc, confirmed against offline hex math. All **P1** unless noted.

## A1 🟠 Light-mode accent contrast fails WCAG AA *and* the 3:1 floor
- **Repro:** any page, **light** theme. Primary CTA = white text on `--color-accent` (`#36a6d6`).
- **Measured (live, app):** `white on #36a6d6` = **2.77:1**. Fails AA-normal (4.5) AND the **3:1** floor
  for large-text / UI components. Accent-as-link (`#36a6d6` on white) also **2.77:1** (on bg-base 2.57:1).
- **Scope:** every primary button (login/register/"Thêm máy chủ MCP"/"Workflow mới"…) + accent links,
  **light mode only**. Dark mode passes (accent-link 6.14:1, btn-text-on-accent 6.64:1).
- **Note:** the newer `--accent` primitive (`#2a8fbf`) = 3.63:1 — better but still <4.5, and **not used**
  by shipped pages. Decision `matte-dark-redesign` §Residual called this "low impact / which is fine" —
  **contradicted**: `#36a6d6` *is* used as button fill + link text.
- **Fix idea:** darken light `--color-accent` to ≥ `#1f6f96` (~4.5:1 on white), or point CTAs/links at a
  darkened `--accent`. Keep dark mode as-is.

## A2 🟠 Glassmorphism leftover — "NO backdrop-blur" design language violated
- **Repro:** any authenticated page; DOM audit finds **2** elements with `backdrop-filter: blur(12px)`:
  - global sticky `header` (top nav, `bg-white/95 … backdrop-blur`)
  - mobile bottom `nav` bar (`fixed inset-x-0 bottom-0 … backdrop-blur`)
- Matte Dark = NO translucency/blur. These hand-written utility classes survived the token-level rollout.
  Global → on **every** page.

## A3 🟠 Reliability (/eval) "Tiến bộ theo thời gian" — recharts dark-theme miss
- **Repro:** `/eval`, dark. DOM: ≥1 line series renders `stroke="#111827"` (slate-900) → **invisible** on
  the dark surface. Other series correct (`#36a6d6` / `#0ea5e9`).
- Y-axis top label truncated **"100%"→"00%"**.
- (Series for ~100% dims correctly flat at top; chart *looks* near-empty due to clustering + the dark series.)

## A4 🟢 Doc drift (not a defect) — WCAG claims imprecise
- Computed vs claimed: light secondary "11.4:1"→**8.04**; dark secondary "6.7"→**8.12**. Both still pass.
  Correct the numbers in CHANGELOG `[Unreleased]` + `decisions/matte-dark-redesign`.

## Not yet checked (next session)
- Visual pass: `/agents/[id]`, `/graph`, `/monitoring`, `/register`. Focus-ring visibility.
  `prefers-reduced-motion` → bloom/drift off. Chart/map recolor on chart-heavy pages.
