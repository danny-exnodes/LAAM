# Checkpoint: claude-docker — 2026-06-05

Scope: Settings hub + Machines sub-page + nav swap (frontend/nav; coordinated w/ FE).
Spec: `docs/superpowers/specs/2026-06-05-settings-hub-machines-subpage-design.md`.

## What was done
- **Fixed: no mobile entry to Machines.** Mobile `BottomNav` already had Settings but
  `/settings` was an empty placeholder.
- `/settings` rewritten → mobile-first hub: **Account** (avatar/name/email/role + sign out),
  **Machines** link, **Appearance** (reused ThemeToggle), **Language** (reused LangSelect).
  i18n vi/en/zh via new `settingsDict`.
- **Machines moved** `/machines` → `/settings/machines` (page content incl. HardwareAnalytics +
  MachinesManager). `/machines` is now a `redirect()` stub (back-compat; avoided next.config
  which a concurrent session is editing).
- **Desktop nav** `app-header.tsx`: `Machines (Server)` → `Settings (Settings icon)`. `BottomNav`
  untouched (already routes /settings + highlights /settings/machines via startsWith).

## Files
- New: `i18n/dictionaries/settings.ts`, `components/settings/{SettingsMenu,SettingsCard,SettingsRow,SignOutButton}.tsx`,
  `app/settings/machines/page.tsx`.
- Modified: `app/settings/page.tsx`, `app/machines/page.tsx` (redirect), `components/app-header.tsx` (NAV).
- `/api/machines*` + `machines-manager.tsx` unchanged.

## Current state (verified)
- `next build` clean; **415/415 tests pass**. Routes `/settings`, `/settings/machines`, `/machines`
  all 307 (exist + protected; no 404). Dev :3100 has it via HMR.
- Commit on main: `feat(settings): Settings hub + Machines as /settings/machines + nav swap`.

## Next steps
- **Prod container REBUILT + deployed** (user go) — image @ main `6e2b303`, healthy on :3900,
  public funnel 200, host sampler up. Routes /settings, /settings/machines, /machines all 307.
- Visual confirm (logged-in /settings on mobile) — build-verified, not screenshotted (auth-gated).
- FE boundary note: `comms/active/docker-to-frontend-settings-nav.md` (resolve once FE acks).

## Blockers / Risks
- Touched FE-owned `app-header.tsx` (was clean; 1-line NAV swap). Coordinated via comms note.
- Desktop nav active-state: Settings highlights on `/settings` (exact) but not `/settings/machines`
  (kept exact-match to stay surgical; BottomNav does highlight via startsWith).
