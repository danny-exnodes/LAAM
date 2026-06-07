# P0 — Access Spine (unified `access_token`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans` (or `subagent-driven-development`) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. **Do NOT start until CTO gates this plan** (thread `comms/active/consultant-to-cto-access-spine-p0-plan`).

**Goal:** Build the auth backbone that generalizes the machine/collector token into a single `access_token` model (verdict H3), so later phases (MCP-server, per-user API) plug in without a second bearer mechanism. P0 is backend spine + minimal repoint, **forward-compatible** (no big-bang token re-issue, collector keeps working throughout).

**Decision source (LOCKED):** `.serena/memories/decisions/machines-decomposition.md` + verdict `comms/.../consultant-to-cto-machines-decomposition.md`.

**Architecture:** New `access_token` table (token removed from `machines` conceptually; `machines.tokenHash` **kept during transition**, dropped in a later phase). One `verifyAccessToken()` chokepoint. `/api/ingest` resolves `access_token(kind=collector)` first, **falls back to `machines.tokenHash`** so existing collectors don't break. Machine creation (`POST /api/machines`) repoints to issue via `access_token` + link `machineId`. sha256 kept (high-entropy token, not a password). UNIQUE index on `tokenHash`. `prefix`/`last4` columns for UI identification.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (node-postgres), Postgres 16, Vitest. Migration via `db:generate`→commit `drizzle/`→`db:migrate` (host/user runs it — drizzle-kit doesn't run in sandbox; see [[db-migrations]]).

**Out of scope for P0** (later phases): `/settings/access` full UI + IA nav changes (Q4), MCP-server (C), Monitoring read-model (B), dropping `machines.tokenHash`, `scope` enforcement beyond a stored column, `api`/`mcp` kind issuance UX.

---

## File Map

| File | Action | Task |
|------|--------|------|
| `src/db/schema.ts` | **Modify** — add `accessTokens` table + types | 1 |
| `drizzle/0009_*.sql` | **Generate** (host) — additive table + unique index | 1 |
| `src/lib/access-token.ts` | **Create** — generate/hash/format + `verifyAccessToken()` | 2 |
| `src/lib/access-token.test.ts` | **Create** | 2 |
| `src/app/api/ingest/route.ts` | **Modify** — resolver: access_token first, machines fallback; bump `lastUsedAt` | 3 |
| `src/app/api/ingest/route.test.ts` | **Create/Modify** | 3 |
| `src/app/api/machines/route.ts` | **Modify** — POST issues via access_token (+machineId link) | 4 |
| `src/app/api/machines/route.test.ts` | **Create/Modify** | 4 |
| `src/app/api/machines/[id]/route.ts` | **Modify** — revoke = set `revokedAt` on the linked token | 4 |
| `scripts/backfill-access-token.ts` | **Create** — one-shot copy machines.tokenHash → access_token | 5 |

---

## Task 1 — Schema: `access_token` table

**Shape** (kind discriminator; `userId` = provenance/revoke/audit, NOT an isolation key — see Q2 invariant):
```ts
export const accessTokens = pgTable("access_token", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),            // collector | api | mcp
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),        // e.g. "laam_a3f2"  (display, non-secret)
  last4: text("last4").notNull(),          // last 4 chars (display)
  tokenHash: text("tokenHash").notNull(),  // sha256(token)
  scopes: jsonb("scopes").$type<string[]>(),// stored now, enforced later (P0 = collector: ["ingest"])
  machineId: text("machineId").references(() => machines.id, { onDelete: "cascade" }), // collector link
  lastUsedAt: timestamp("lastUsedAt", { mode: "date" }),
  expiresAt: timestamp("expiresAt", { mode: "date" }),
  revokedAt: timestamp("revokedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
}, (t) => [unique("access_token_hash_key").on(t.tokenHash)]);
```
- [ ] Add table + `export type AccessToken = typeof accessTokens.$inferSelect;`
- [ ] `npm run db:generate` (HOST) → review `drizzle/0009_*.sql` is **additive only** (CREATE TABLE + UNIQUE), no ALTER on `machines`.
- **Success:** `tsc` clean; generated SQL additive; `machines.tokenHash` untouched.

## Task 2 — `lib/access-token.ts` (TDD)

- [ ] **Failing tests** (`access-token.test.ts`): `generateAccessToken()` returns `laam_`-prefixed token; `formatTokenDisplay(token)` → `{prefix, last4}` deterministic; `hashToken` matches existing sha256 (reuse `machine-token.ts` `hashToken`); `verifyAccessToken(token, {kind})` returns the row for a valid non-revoked non-expired token, `null` for revoked/expired/unknown; bumps `lastUsedAt` (assert via mock db).
- [ ] **Implement.** Reuse `machine-token.ts` (`generateMachineToken`/`hashToken`) — re-export or call; do NOT fork the hashing. `verifyAccessToken`: `WHERE tokenHash = sha256(token) AND revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now)`; optional `kind` filter; on hit, fire-and-forget `lastUsedAt = now`.
- **Success:** tests green; sha256 identical to machine-token (no second hash algo).

## Task 3 — `/api/ingest` resolver (forward-compat) (TDD)

- [ ] **Failing tests** (`route.test.ts`): (a) valid `access_token(kind=collector)` → 200, upserts under its `machineId`, bumps token `lastUsedAt`; (b) **legacy** `machines.tokenHash` still valid → 200 (fallback path), bumps `machines.lastSeen`; (c) unknown token → 401.
- [ ] **Implement.** In POST: `const tok = await verifyAccessToken(token, {kind:"collector"})`. If `tok?.machineId` → use it. **Else fallback:** existing `machines.tokenHash` lookup (unchanged). 401 only if both miss. Keep `machines.lastSeen` bump on the resolved machine either way. **Invariant:** ingest still writes **org-shared** monitoring rows (Q2 — `userId` is NOT an isolation key here).
- **Success:** all 3 paths green; no behavior change for an un-migrated collector.

## Task 4 — `POST /api/machines` issues via access_token; revoke (TDD)

- [ ] **Failing tests** (`route.test.ts`): owner/admin POST → creates `machine` row + `access_token(kind=collector, machineId, scopes:["ingest"])`, returns `{token, prefix, last4}` once; non-owner → 403; DELETE `/[id]` → sets `revokedAt` on linked token (token no longer verifies) and the machine row handling matches current behavior.
- [ ] **Implement.** POST: create machine (no `tokenHash` now), then `accessTokens.insert` with `formatTokenDisplay`. Return raw token once. GET stays (machines list); `hasToken` derives from existence of a non-revoked linked access_token (LEFT JOIN or follow-up query). DELETE: revoke token (set `revokedAt`), keep current machine semantics.
- **Note (FE):** `machines-manager.tsx` token-display copy unchanged (still shows raw token once on create). Listing "token hoạt động" now reads non-revoked access_token. Minimal — no `/settings/access` page yet.
- **Success:** issue→ingest→revoke→ingest-401 round-trip green.

## Task 5 — Backfill script (one-shot, host-run)

- [ ] `scripts/backfill-access-token.ts`: for each `machines` row with non-null `tokenHash` and no linked access_token → insert `access_token(kind=collector, machineId, tokenHash, prefix:"laam_…", last4:"????", scopes:["ingest"], name:machine.name)`. Idempotent (skip if a token with that `tokenHash` exists). `prefix/last4` unknown for legacy hashes → store sentinels (`"legacy"`, `"----"`); display layer tolerates.
- **Success:** running twice = no dupes; legacy collectors keep working via either path.

---

## Verification (Phase 5 — never skipped)
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm test` — full suite green (existing 1117+ tests + new).
- [ ] Manual round-trip (HOST/USER, agent does NOT run services): `db:migrate` 0009 → backfill → create machine → run collector with new token → ingest 200 → revoke → ingest 401. Legacy token (pre-migrate) → ingest 200 (fallback).

## Sequencing note
This is **P0** of the locked roadmap: `Access (P0)` → [`MCP-server` ∥ `Monitoring read-model`]. The `scopes` column + `kind=api|mcp` are laid here but exercised by later phases. Dropping `machines.tokenHash` is a **separate later migration** after all collectors are confirmed migrated.

## Risks
- **Migration host-only** ([[db-migrations]]): drizzle-kit can't run in sandbox; user runs `db:generate`/`db:migrate`. Plan assumes host applies 0009 before Task 3/4 integration verify.
- **Forward-compat is load-bearing:** if the ingest fallback is dropped too early, un-migrated collectors 401. Keep both paths until a later phase explicitly drops `machines.tokenHash`.
- **`hasToken` derivation:** GET /api/machines must not regress (UI shows token state) — covered by Task 4 tests.
