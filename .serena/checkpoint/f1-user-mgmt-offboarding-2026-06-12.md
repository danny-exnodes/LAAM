# Checkpoint: F1 user-mgmt + off-boarding — 2026-06-12

## What was done
- **F1 (folded off-boarding in):** user-management UI + role change + disable-revokes-tokens.
- migration **0012** (`drizzle-kit generate` WORKED in worktree) — `user.disabled_at` nullable.
- API: `GET /api/users` (owner/admin, safe column whitelist), `PATCH /api/users/[id]`
  ({role} owner-only + last-owner/self guards + audit; {disabled} owner/admin tx =
  revoke ALL access_token + clear legacy `machines.tokenHash` WHERE ownerUserId + audit).
- auth.ts: disabled users can't log in (checked after password → no state leak; pure
  helper `src/lib/auth/disabled.ts`).
- `access-tokens/[id]` DELETE: owner/admin revoke ANY token; self-revoke for all; 404 on no-match.
- UI: `/settings/users` (owner/admin, redirect others), `/settings/access` (everyone);
  SettingsMenu rows; i18n `users.ts`+`access.ts`+settings keys (vi/en/zh).

## Files changed
- schema.ts, drizzle/0012_*.sql + 0012_snapshot.json + _journal.json
- api/users/route.ts(+test), api/users/[id]/route.ts(+test), api/access-tokens/[id]/route.ts(+test)
- auth.ts, lib/auth/disabled.ts(+test)
- settings/users/page.tsx, settings/access/page.tsx
- components/settings/{UsersManager,UsersTitle,AccessTokensManager,AccessTitle,SettingsMenu}.tsx(+tests)
- i18n/dictionaries/{users,access,settings}.ts(+tests)

## Current state
- Full vitest **1702 pass** (baseline 1653, +49). tsc clean. 2 commits: `9b79cb1` (backend), `c8c2085` (UI).
- machines OWNER column = `machines.ownerUserId` (FK set-null) — off-boarding clears tokenHash by it.
- audit_log.target = JSON string (column is text): role_change {actor,subject,from,to}; user_disabled/enabled {actor,subject}.

## Next steps
- **HOST must run `npm run db:migrate`** to apply 0012 before this ships (tests mock db, pass without the column).
- Remaining batch2: F2 notifications, F3 monitoring unify, F4 claude-runtime.

## Blockers / Risks
- Disabled-login path verified only by unit test (helper + revoked-token chain); NOT runtime-verified (no server start). Low risk — logic is a 1-line guard after bcrypt.compare.
