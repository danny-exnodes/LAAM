# Checkpoint: claude (connectors arc) — 2026-06-06

> Dedicated file (the shared `claude-2026-06-06.md` is contended by a parallel
> world-tools session). Covers the full Connectors fix & improve + MCP arc.

## What was done (P1 → P6, all merged to main except P6)
- **P3 OAuth Google in-app** + **P4a write-ready contract (`ConnectorTool.kind`)** + **P1 UI polish** — commit 1a721d7 (on main).
- **P4b read expansion + P5 write actions** (+21 tools/6 connectors, 6 parallel subagents) + **P2 i18n content** — commit 798e160 (on main).
- **P6 LAAM as MCP client** — commit **e3e7ed0** (branch `feat/connectors-mcp-client`, **NOT yet merged at write time**): per-user HTTP MCP servers (mcp:<slug> creds rows, no schema change), dynamic discovery (`mcp__<slug>__<tool>`, 30s cache), kind FAIL-CLOSED + per-server `trustReadHints` opt-in → `readAllow` into `withSafety` (stream+resume), `/api/connectors/mcp` CRUD, `McpServersSection` UI, SSRF guard, dep `@modelcontextprotocol/sdk@1.29.0`. Decision: `decisions/connectors-mcp-client.md`.

## Current state
- **tsc clean; full suite 1024/1024.** Connector surface: 15 → 36 tools + dynamic MCP tools.
- Write surface = 11 static + MCP writes, all gated (confirm-card) + HIGH-blast fail-closed in workflows.

## Next steps
- Merge `feat/connectors-mcp-client` → main (in progress this session).
- **Operator handoffs (cannot do in code):** Google Cloud Console OAuth app (External+Testing, test users, scopes incl. write, redirect URI) + env `GOOGLE_OAUTH_CLIENT_ID/SECRET/OAUTH_PUBLIC_BASE_URL`; live-verify OAuth + a real MCP server. Google write tools fire only after write-scope re-consent.
- Deferred: MCP in workflow nodes, admin-shared MCP, MCP resources/prompts.
- `INDEX.md` P6 entry pending — a parallel session held uncommitted edits to INDEX, so I did not touch it; add the `connectors-mcp-client` line when INDEX settles.

## Blockers / Risks / Lessons
- Google Testing-mode refresh tokens expire ~7 days (by-design `needs_reconnect`).
- ⚠️ Lessons: don't `git stash` mid multi-file work; a `cd` in a Bash compound persists (run from repo root); the day's checkpoint file is shared across parallel sessions — append carefully or use a dedicated file (this one).
