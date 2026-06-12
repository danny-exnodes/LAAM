# Admin-Provisioned Access Keys — Implementation Plan

> **For agentic workers:** task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** owner/admin can issue an api/mcp access token *on behalf of* another user, and view all keys grouped by user — completing request (b) (bidirectional key↔user). Self-service `/settings/access` stays unchanged for members.

**Architecture:** extend the existing `POST`/`GET /api/access-tokens` (role-aware, like the existing `DELETE`); add one additive nullable column `createdByUserId`; harden two pre-existing latent issues this feature amplifies. No new state machine (LOCKED: team <50).

**Version bump:** v2.4.0 → **v2.4.1** (additive; migration 0014).

**Source:** adversarial design-critique workflow (security / data-model / product / completeness lenses + synthesis), verified file:line against `main`. Decision memory: `.serena/memories/decisions/access-provisioning.md`.

---

## 0. Verified ground truth (re-confirmed)

| Claim | Cite |
|---|---|
| `laam_query_audit` reads full audit log, NO ctx.userId filter, NO action allowlist | `src/lib/agent/tools/laam/query-audit.ts:29-38` |
| MCP stamps `agentSessions.userId = tok.userId` (attribution, not isolation) | `src/app/api/mcp/route.ts:24,45-55` |
| `verifyAccessToken` checks only revokedAt/expiresAt/kind — **no `disabledAt` join** | `src/lib/access-token.ts:48-50` |
| Off-boarding tx revokes tokens by `userId=subject` (disabling SUBJECT kills provisioned keys; disabling ADMIN does not) | `src/app/api/users/[id]/route.ts:98-115` |
| Existing `GET()` takes **no `req`**; tests call `GET()` zero-arg | `route.ts:16`; `route.test.ts:66,76` |
| `access_token` has only `unique(tokenHash)` — no userId index | `schema.ts:185-211` |
| Latest migration `0013` → next `0014` | `drizzle/` |
| rbac memory line 22 falsely asserts "mcp/route.ts ctx.userId lọc data" | `rbac-live-holes-and-batch2.md:22` |

`userId` on `access_token` = **attribution/provenance**, NOT a live data-isolation key. The `laam_*` read tools ignore `ctx.userId` and read org-shared monitoring + (pre-fix) the full audit log. ⇒ an admin-minted read-only token grants nothing a member can't already see *today*; the risks are (a) attribution-impersonation, (b) the newly-amplified audit leak, (c) forward escalation if per-user MCP isolation ever ships.

---

## 1. Open-question resolutions

- **Q-A createdByUserId column:** **IN** (migration 0014). Read-path column; the keys expander + "provisioned by X" badge need it per-row; reconstructing from `audit_log.target` JSON is an unindexed scan. Rejected: audit-only (saves one migration, but 0014 is additive/nullable/no-backfill).
- **Q-B mint-for-other role:** **owner/admin MAY**, BUT **admin may NOT mint for an owner/admin target — only owner may** mint for a privileged subject. Rejected: blanket owner-only (over-rotates vs revoke-any precedent); blanket owner/admin no-guard (bakes in a privileged-target escalation primitive).
- **Q-C attribution-impersonation:** issue-time audit alone is **not enough**. Ship a **code-forced** name suffix `" (provisioned by <admin>)"` (Rule 13: derived from session, never echoed) + surface `createdByUserId` in the keys list and the subject's own `/settings/access`. Per-use `agent_session` stamping → **backlog** (touches hot table).
- **Q-D disabled/privileged targets:** target MUST exist (**404**) AND not be disabled (**400** if `disabledAt`). Privileged targets gated per Q-B. Use the **code-validated** target id, never the echoed body.
- **Q-E reveal-once to admin:** **accepted** for <50-person org WITH guardrails: token value never in `audit.target`/logs; `Cache-Control: no-store`; honest reveal warning; distinguishable name. Rejected: pending-key/user-completes-mint flow (better long-term, but a state machine — LOCKED no-state-machine) → backlog.
- **Q-F gate `laam_query_audit`:** **IN SCOPE NOW** — minimal `eq(auditLog.userId, ctx.userId)` when `ctx.userId` set (a token sees only its own principal's actor rows). This PR adds sensitive rows to that log; deferring ships a feature whose own trail leaks. Broad MCP org-shared-read (search-sessions/get-timeline/etc.) stays backlog.
- **open#5 org-wide all-keys table:** **DEFER.** Per-user expander + self-service satisfies bidirectional; a global table = full-scan + double join + new page for a rare lookup. Revoke-by-id already works org-wide.

---

## 2. Tasks

### Task 1 — Migration 0014 + schema column
**Files:** `src/db/schema.ts`; generated `drizzle/0014_*.sql` + `drizzle/meta/_journal.json`.
- Add to `accessTokens`: `createdByUserId: text("createdByUserId").references(() => users.id, { onDelete: "set null" })` (nullable; null = self-service / pre-0014). Mirror `userId` set-null semantics + comment.
- `npm run db:generate` → commit `drizzle/`. **Host runs `npm run db:migrate`** (worktree migrate won't touch host DB).
- Verify: `tsc`; `drizzle-kit generate` clean after.

### Task 2 — `GET` cross-user mode (signature-safe)
**Files:** `src/app/api/access-tokens/route.ts`; `route.test.ts`.
- `GET(req?: Request)` with defensive guard (existing zero-arg callers must not break).
- Role-first: `const targetUserId = isPrivileged && param ? param : session.user.id`. Member's `?userId` is **structurally ignored**.
- Cross-user select adds `createdByUserId`; join provisioner identity with safe whitelist `{id, name}` (mirror `/api/users`). NEVER `tokenHash`.
- **Tests:** update both `GET()` → `GET(new Request("http://x"))`; member `?userId=<other>` → ONLY caller's tokens (assert other's id absent); admin `?userId=<other>` → that user's tokens; response never contains `tokenHash`; Rule 13 — `provisionedBy` maps from DB row keyed by stored userId, not echoed.

### Task 3 — `POST forUserId`
**Files:** `src/app/api/access-tokens/route.ts`; `route.test.ts`.
- Zod pinned to `{ name, kind, forUserId? }`. Never spread body into insert.
- `forUserId` absent/==self → unchanged self-service (`requireMutator`; `createdByUserId` NULL).
- `forUserId` != self → `requireRole(owner/admin)` **early return**; look up target `{id,role,disabledAt}` (404 missing / 400 disabled); Q-B guard (admin→privileged target = 403); code-suffix name `(provisioned by <actor.name>)`; **tx**: insert token (`userId`=target.id, `createdByUserId`=actorId, `scopes:["read"]`) + audit `token_issued_for` `{actor,subject,tokenId,kind}`; response adds `forUserId` + header `Cache-Control: no-store`. Token value NEVER in audit.
- **Tests:** member forUserId!=self → 403 (no insert); viewer forUserId=self → 403 (mutator gate); admin→member → 200 (userId=target, createdByUserId=actor, name suffixed); missing→404; disabled→400; admin→owner/admin target→403; owner→admin target→200; audit row in same tx; tx rollback (audit fail rolls back insert); `no-store` present; **Rule 13** — mock target lookup returns id ≠ requested forUserId → inserted userId is the looked-up id; token value absent from audit.target.

### Task 4 — `DELETE` cross-user audit
**Files:** `src/app/api/access-tokens/[id]/route.ts`; `[id]/route.test.ts`.
- `.returning({ id, userId })`; if `isPrivileged && revoked.userId !== actorId` → audit `token_revoked_for` `{actor, subject: revoked.userId, tokenId}`. Self-revoke unlogged.
- **Tests:** admin revokes another's token → audit with subject=revoked.userId (code-derived); self-revoke → no audit; 404 path unchanged.

### Task 5 — `laam_query_audit` principal-scope (Q-F)
**Files:** `src/lib/agent/tools/laam/query-audit.ts`; `query-audit.test.ts`.
- `where = and(action ? eq(auditLog.action, action) : undefined, ctx?.userId ? eq(auditLog.userId, ctx.userId) : undefined)`. Comment: minimal in-scope close of the newly-amplified leak; broad MCP scoping stays backlog.
- **Tests:** with `ctx.userId` → WHERE includes `eq(auditLog.userId, ctx.userId)`; without → unchanged.

### Task 6 — `verifyAccessToken` disabled re-check (defense-in-depth)
**Files:** `src/lib/access-token.ts`; `access-token.test.ts`.
- Reject if owning user `disabledAt` is set (cheap `users.disabledAt` lookup / join), even when `revokedAt` null. Makes disable authoritative regardless of token-row state.
- **Tests:** token whose owner is disabled → `verifyAccessToken` returns null though revokedAt null; active owner → unchanged; null userId → unchanged.

### Task 7 — UI: UsersManager keys expander + /settings/access transparency
**Files:** `src/components/settings/UsersManager.tsx`; `AccessTokensManager.tsx`; `src/i18n/dictionaries/users.ts` + `access.ts`; component + dict tests.
- UsersManager per-row **"Keys" expander** → `GET ?userId=row.id` → list (name/kind/last-used/provisioned-by) + **"Provision key"** (name+kind → `POST forUserId`, **distinct** reveal-once modal "Key provisioned for <name>") + revoke. **Hide "Provision key" on own row** (reuse `isSelf`).
- `/settings/access`: show "provisioned by <admin>" when `createdByUserId != self`; honest scope warning on reveal card.
- Update `access.scopeNote` to honest "reads all monitoring + full audit log (read-only)".
- i18n keys (vi canonical → en/zh): `users.keys.{expand,empty,provision,provisionFor,modalTitle,provisionedBy,col.name,col.kind,col.lastUsed,revoke,confirmRevokeOther,warning}`, `users.ok.provisioned`, `users.err.{targetDisabled,targetNotFound,targetPrivileged}`. Dict test asserts all three languages.

### Task 8 — Docs + memory
**Files:** `CHANGELOG.md` ([Unreleased]); `README.md` (vi RBAC/access note); `.serena/memories/decisions/access-provisioning.md` (new) + `rbac-live-holes-and-batch2.md` correction (line 22) + `INDEX.md`; backlog files.
- Backlog: `access-mcp-orgshared-read.md` (broad hole), `access-per-use-attribution.md` (agent_session stamp), `access-provisioned-key-handoff.md` (pending-key flow + TTL); re-gate-write-to-owner-only note.

---

## 3. Guard summary

| Path | Guard |
|---|---|
| POST self / self-forUserId | `requireMutator` (viewer 403) |
| POST forUserId != self | `requireRole(owner/admin)` early; exists (404); not disabled (400); admin→privileged target 403 |
| POST insert | userId=looked-up target; createdByUserId=session; name code-suffixed; tx+audit; `no-store` |
| GET ?userId | role-first; member force-to-self; masked, no hash; safe-whitelist join |
| DELETE cross-user | audit `token_revoked_for` when privileged & subject≠actor |
| laam_query_audit | `eq(auditLog.userId, ctx.userId)` when ctx.userId set |

New audit actions: `token_issued_for`, `token_revoked_for` (target `{actor,subject,tokenId,kind}` — never the token value).
