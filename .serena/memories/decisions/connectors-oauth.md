# Connectors — Google OAuth (in-app) + write-ready tool contract

**2026-06-06** · commit **1a721d7** (branch `feat/connectors-oauth-expansion`) · spec `docs/superpowers/specs/2026-06-06-connectors-oauth-google-design.md`

## Decisions
- **OAuth model:** ONE operator-registered Google app (env `GOOGLE_OAUTH_CLIENT_ID/SECRET/OAUTH_PUBLIC_BASE_URL`), **External + Testing** (account context = personal Gmail). **Per-connector grants** (each Google connector = its own creds row; least-privilege; **no schema change** — tokens stored in the existing encrypted creds blob).
- **7-day reality (verified):** External+Testing refresh tokens are revoked ~weekly. We DESIGN a `needs_reconnect` tri-state + one-click reconnect rather than pursue Google verification/**CASA** (gmail/drive readonly = *restricted* scopes; calendar = *sensitive*) — CASA is disproportionate for a <50-user self-hosted tool.
- **Flow:** GET `/api/connectors/:id/authorize` → Google → shared GET `/api/connectors/google/callback`. connectorId carried in an encrypted (`crypto.ts`) httpOnly **SameSite=Lax** state cookie + **PKCE S256**. `access_type=offline` + `prompt=consent` (required to obtain/re-obtain refresh_token).
- **Refresh chokepoint:** `execute()` + `testConnector()` refresh the access token before each call (covers BOTH chat dispatch and workflow `connectorExecute`). `invalid_grant` → sets `_needsReconnect`. Handlers keep `(args, creds)` signature (refresh is external to them).
- **Write-ready contract (P4a):** `ConnectorTool.kind` is **self-declared**; `policy.ts` derives the read/write map from the `CONNECTORS` registry (replaced central `CONNECTOR_WRITES/READS` sets); fail-closed preserved (unknown → write). Adding a tool now touches ONE connector file → P4b read-expansion is parallel-safe.
- **email display:** request `openid email` scopes; parse `id_token` (no extra request) → `google_email` for "connected as X" (user has multiple personal Gmail accounts).

## Status
- Built + verified (tsc clean, 890 tests). **Live Google round-trip = operator handoff** (Console app + env + run server).
- **Deferred:** P2 i18n connector-supplied content; P4b read-tool expansion; P5 write actions (needs user write perms; `gmail.send` needs OAuth write scope + re-consent). SP-2 write-gate already gates writes (confirm-card).
