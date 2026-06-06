# Connectors — Google OAuth (in-app) + write-ready tool contract

**2026-06-06** · commit **1a721d7** (branch `feat/connectors-oauth-expansion`) · spec `docs/superpowers/specs/2026-06-06-connectors-oauth-google-design.md`

## Decisions
- **OAuth model:** ONE operator-registered Google app (env `GOOGLE_OAUTH_CLIENT_ID/SECRET/OAUTH_PUBLIC_BASE_URL`), **External + Testing** (account context = personal Gmail). **Per-connector grants** (each Google connector = its own creds row; least-privilege; **no schema change** — tokens stored in the existing encrypted creds blob).
- **7-day reality (verified):** External+Testing refresh tokens are revoked ~weekly. We DESIGN a `needs_reconnect` tri-state + one-click reconnect rather than pursue Google verification/**CASA** (gmail/drive readonly = *restricted* scopes; calendar = *sensitive*) — CASA is disproportionate for a <50-user self-hosted tool.
- **Flow:** GET `/api/connectors/:id/authorize` → Google → shared GET `/api/connectors/google/callback`. connectorId carried in an encrypted (`crypto.ts`) httpOnly **SameSite=Lax** state cookie + **PKCE S256**. `access_type=offline` + `prompt=consent` (required to obtain/re-obtain refresh_token).
- **Refresh chokepoint:** `execute()` + `testConnector()` refresh the access token before each call (covers BOTH chat dispatch and workflow `connectorExecute`). `invalid_grant` → sets `_needsReconnect`. Handlers keep `(args, creds)` signature (refresh is external to them).
- **Write-ready contract (P4a):** `ConnectorTool.kind` is **self-declared**; `policy.ts` derives the read/write map from the `CONNECTORS` registry (replaced central `CONNECTOR_WRITES/READS` sets); fail-closed preserved (unknown → write). Adding a tool now touches ONE connector file → P4b read-expansion is parallel-safe.
- **email display:** request `openid email` scopes; parse `id_token` (no extra request) → `google_email` for "connected as X" (user has multiple personal Gmail accounts).

## Status — ALL of P1–P5 built + verified (2026-06-06)
- **Merged to `main`** (OAuth tranche). P2/P4b/P5 on branch `feat/connectors-p2-p5`, commit **798e160** (ready to merge).
- **P4b/P5 — +21 tools across 6 connectors** (kind-classified; via 6 parallel subagents, conflict-free thanks to self-declared kind):
  - github: get_repo/list_commits/list_pull_requests (r) + create_issue/comment_issue (w)
  - trello: list_lists/get_card (r) + update_card/comment_card (w)
  - jira: get_issue/list_projects (r) + add_comment/create_issue (w)
  - google-calendar: list_calendars/search_events (r) + create_event (w, +calendar.events)
  - google-drive: get_file/export_text (r) + create_folder (w, +drive.file)
  - gmail: get_message (r) + send (w, +gmail.send)
- **Write surface = 11 tools**, ALL gated by withSafety (confirm-card) and HIGH-blast (NOT in BLAST_LOW) → fail-closed in workflows (interactive confirmed chat only). Google write scopes need **user re-consent** (reconnect flow).
- **P2** — connector blurb/help/setup i18n vi/en/zh (14 keys, `conn.svc.<id>.*`, UI fallback).
- Verified: **tsc clean, 922 tests pass**. **Live Google round-trip still = operator handoff** (Console app + env + run server); write tools need write-scope re-consent to actually fire.
