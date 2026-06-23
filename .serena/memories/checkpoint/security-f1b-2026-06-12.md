# Checkpoint: security-F1b — 2026-06-12

## What was done
- Implemented F1b: disabled/deleted user loses access on their NEXT request (not after JWT expiry ~30 days)
- Created `src/lib/auth/session-refresh.ts` — `refreshSessionFromDb(userId)` helper
  - ONE indexed PK lookup per authenticated request (acceptable for <50 users)
  - Returns `{valid:true, role}` for active users, `{valid:false}` for disabled/deleted
  - Fail-open on DB error: returns `{valid:true, role:undefined}` + logs; caller keeps old role
- Extended `jwt()` callback in `src/auth.config.ts`
  - Sign-in path (user arg present): unchanged, sets role from user object
  - Token-refresh path (no user, subsequent requests): calls `refreshSessionFromDb(token.sub)`
  - Disabled/deleted → returns `null` (Auth.js v5 `@auth/core` supports `jwt()→null` natively)
  - Active user → refreshes `token.role` from DB (bonus: role change takes effect without re-login)
  - No-sub token → passes through untouched (no crash)
- Added 12 new tests (6 helper + 6 jwt callback) to cover all paths including fail-open

## Files changed
- `src/lib/auth/session-refresh.ts` (created)
- `src/lib/auth/session-refresh.test.ts` (created)
- `src/auth.config.ts` (modified — async jwt callback + refreshSessionFromDb import)
- `src/auth.config.test.ts` (modified — added vi.mock + 6 jwt tests)

## Current state
- All tests: 1733 passed (was 1702, +31 tests)
- TSC: 2 pre-existing errors in notifications/events (not my files, verified by stash check)
- Commit SHA: 23fe6bc on feat/batch2

## Invalidation mechanism
`jwt()` returning `null` — supported natively in `@auth/core` (see `node_modules/@auth/core/index.d.ts:331`: `=> Awaitable<JWT | null>`). Auth.js v5 clears the session cookie when jwt returns null.

## Next steps
- This is complete. No follow-up needed for F1b.
- The 2 pre-existing TSC errors (events/route.ts + notifications/index.test.ts) belong to the notifications task — another agent owns those.

## Blockers / Risks
- None. The fail-open policy is a documented design decision (comment in session-refresh.ts).
