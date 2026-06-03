# Checkpoint: framework — 2026-06-03

## What was done
- Wave 4 Package **W4-F (connector framework)**, TDD. Implemented the 3 framework files + tests.
- Sub-plan: `docs/superpowers/plans/2026-06-03-v2-wave4-pkgF-framework.md`.

## Files changed
- Created `v2/src/lib/connectors/crypto.ts` — AES-256-GCM `encryptJson`/`decryptJson`; blob = `iv:tag:ciphertext` (base64); 32-byte key = sha256(`CONNECTOR_KEY ?? AUTH_SECRET ?? dev-fallback`).
- Created `v2/src/lib/connectors/store.ts` — `getCreds`/`setCreds`/`delCreds` on `connectorCredentials` (Drizzle), secret col = encryptJson(creds), upsert on (userId, connectorId). Unreadable blob → getCreds returns null.
- Modified `v2/src/lib/connectors/index.ts` — implemented locked stubs `list/isConnected/connect/disconnect/testConnector/chatTools/execute` (all user-scoped); ported v1 logic: mask last-4 for secret fields, token connected = all fields set, demo/oauth via `_connected === "true"`, TOOL_OWNER map from CONNECTORS.
- Created `crypto.test.ts` / `store.test.ts` / `index.test.ts`.

## Current state
- `npx vitest run src/lib/connectors/crypto src/lib/connectors/store src/lib/connectors/index` → **26 passed (3 files)**.
- `tsc --noEmit` clean for my 3 files. The only repo tsc error is `jira.ts(23,23)` — owned by `connectors` agent, NOT mine.
- NOT committed (per instructions).

## Next steps (TL integration)
- Migration must be generated on host: `npm run db:generate && npm run db:migrate` (connectorCredentials table needs to exist live).
- A/T import the now-real framework fns from index.ts.

## Blockers / Risks
- **Encryption key source (deviation to confirm):** used sha256(src)→32 bytes, src = `CONNECTOR_KEY ?? AUTH_SECRET ?? dev-fallback`. `.env.example` defines AUTH_SECRET; no CONNECTOR_KEY. Dev fallback means creds written under fallback become unreadable once a real key is set (getCreds returns null → re-connect needed). Acceptable; surfaced.
- `_connected` stored as string `"true"` (creds are Record<string,string>).
