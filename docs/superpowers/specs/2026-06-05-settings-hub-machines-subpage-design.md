# Spec: Settings hub + Machines as sub-page + nav swap

- **Date**: 2026-06-05
- **Author**: Claude (tech-lead / infra session)
- **Status**: Approved (user) — implementing
- **Problem**: No way to reach `/machines` on mobile. Mobile `BottomNav` has **Settings**
  (not Machines), but `/settings` is an empty "coming soon" placeholder.

## Approved decisions (user)
1. **Move the route**: `/machines` → `/settings/machines` (+ redirect from `/machines`).
2. **Settings v1 content**: Account · Machines · Appearance · Language.

## Changes
### Routes
- `/settings` (server, auth) → renders a mobile-first **SettingsMenu**.
- `/settings/machines` (server, auth) → the current Machines page content **moved here**
  (`HardwareAnalytics` + `MachinesManager`), `AppHeader current="/settings/machines"`.
- `/machines` → `redirect("/settings/machines")` stub (back-compat; avoids touching the
  concurrently-edited `next.config.ts`). `/api/machines*` is unchanged.

### Nav
- **Desktop** `app-header.tsx` NAV: replace `{ /machines, "Machines", Server }` with
  `{ /settings, "Settings", Settings }`. Drop the now-unused `Server` import. *(FE-owned file
  → Serena boundary note; verify not dirty before editing.)*
- **Mobile** `BottomNav`: already has Settings + `current.startsWith(href+"/")` → highlights on
  `/settings/machines`. **No change.**

### Components (new, focused) + reuse
- `src/components/settings/SettingsMenu.tsx` (client) — `useT(settingsDict)`; renders the
  cards/rows; embeds `ThemeToggle` + `LangSelect` (reused). Takes `user` props from the page.
- `src/components/settings/SettingsCard.tsx` — titled card shell (app card idiom).
- `src/components/settings/SettingsRow.tsx` — row: link variant (icon+label+sub+chevron→href)
  or control variant (icon+label+right-slot control).
- `src/components/settings/SignOutButton.tsx` (client) — `signOut({ callbackUrl:"/login" })`.
- Reuse: `ThemeToggle`, `LangSelect`, `gravatarUrl`.

### i18n
- New `src/i18n/dictionaries/settings.ts` (vi/en/zh), `settings.*` keys (account, machines,
  appearance, language, logout, role, …). Used by the client `SettingsMenu` (CLAUDE.md: i18n
  all user-facing strings). Server `PageHeader` keeps the hardcoded-VI title like every other
  page (conformance).

### Visual (bám style guide + mobile-first)
Cards `rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800
dark:bg-neutral-900`, rows divided by `divide-neutral-100 dark:divide-neutral-800`, accent
`#6d5efc` for active/links, lucide icons. Account card = avatar + name + email + role badge +
SignOutButton. Responsive `p-4 sm:p-6`, clears the BottomNav (`pb-24`).

## Coordination (multi-session)
Serena `comms/active` note: this session owns `/settings*`, settings components, settings dict,
the `app-header.tsx` NAV swap, and the `/machines` redirect. `BottomNav` and `machines-manager`
untouched. If FE is mid-editing `app-header.tsx`, coordinate the one-line NAV change.

## Scope (YAGNI)
v1 = Account/Machines/Appearance/Language. Future: notifications, agent thresholds, profile edit.

## Success criteria
- [ ] Mobile: BottomNav → Settings → tap Machines → `/settings/machines` (Hardware Analytics +
      manager render). Desktop: header shows **Settings** (not Machines); Settings → Machines works.
- [ ] `/machines` redirects to `/settings/machines`. `/api/machines*` still works.
- [ ] Theme + language change from the Settings page (reused controls).
- [ ] Light/dark, responsive to 440px. i18n vi/en/zh complete.
- [ ] `next build` + test suite green. No collision with FE on shared files.

## Notes
No meaningful pure logic to TDD (UI + route move); verify via build + suite + behavior.
