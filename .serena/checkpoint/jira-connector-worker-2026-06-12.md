# Checkpoint: jira-connector-worker — 2026-06-12

## What was done
- Jira connector migrated off removed GET /rest/api/3/search (410, CHANGE-2046) to GET /rest/api/3/search/jql with mandatory fields=summary,status,assignee, maxResults=15; result shape now { count, issues } (no total).
- Default JQL when model passes none: "updated >= -30d ORDER BY updated DESC" (endpoint rejects unbounded JQL); jira_my_issues keeps assignee = currentUser() (bounded). 400s from user JQL flow through verbatim.
- OAuth (Atlassian 3LO) dual-mode: auth.type "oauth", provider "atlassian", scopes [read:jira-work, write:jira-work, read:jira-user, read:me, offline_access]; manual site/email/api_token fields kept as fallback. Bearer mode routes via https://api.atlassian.com/ex/jira/{cloud_id} (throws "thiếu cloud_id — hãy kết nối lại Jira" if absent); browse links prefer creds[ATLASSIAN_CREDS.siteUrl].

## Files changed
- src/lib/connectors/jira.ts (modified)
- src/lib/connectors/jira.test.ts (modified — search tests updated; added default-JQL, 400-passthrough, Bearer round-trip, missing-cloud_id tests)

## Current state
- npx vitest run src/lib/connectors/jira.test.ts → 14/14 passed.
- tsc --noEmit: zero errors in jira.ts/jira.test.ts (pre-existing errors in other files untouched).

## Next steps
- Main session: registry/i18n/policy wiring; decide whether jira write tools should declare recipientField (key/projectKey) — left absent, matching github.ts convention.

## Blockers / Risks
- None for this module. workflowSafe omitted on write tools (fail-closed) as before.
