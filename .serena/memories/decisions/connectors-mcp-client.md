# Connectors — P6: LAAM as MCP client

**2026-06-06** · commit **e3e7ed0** (branch `feat/connectors-mcp-client`) · spec `docs/superpowers/specs/2026-06-06-mcp-client-connector.md`

## Decision
LAAM can act as an MCP **client**: per-user remote MCP servers (HTTP) whose tools surface in chat, wrapped in the existing SP-2 safety layer.
- **Transport:** HTTP — `StreamableHTTPClientTransport` → `SSEClientTransport` fallback. No child processes (rejected stdio: ops weight + per-user infeasible).
- **Auth/ownership:** per-user. Each server = one `connector_credentials` row `connectorId="mcp:<slug>"`, secret `{name,url,authToken,trustReadHints}`. **No schema change.**
- **Discovery:** dynamic per-user (`tools/list`), namespaced `mcp__<slug>__<tool>`, 30s cache (`discoverForUser`/`invalidateUser`). The registry stays static; MCP is the dynamic branch.
- **kind = FAIL-CLOSED:** every MCP tool is `write`/gated UNLESS the per-server `trustReadHints` × the tool's `readOnlyHint` → adds the namespaced name to a per-user `readAllow` set. `resolveKind`/`withSafety` gained an optional `readAllow`; the chat route computes + passes it (stream **and** resume). MCP writes are HIGH-blast → **fail-closed in workflows**.
- **Scope v1:** chat-only (NOT workflow nodes); admin-shared deferred; **tools only** (no resources/prompts).
- **SSRF guard** on the user-supplied URL (block localhost/private/link-local/metadata). Dep: `@modelcontextprotocol/sdk@1.29.0`.

## Module map
`src/lib/connectors/mcp/{types,ssrf,store,client,discovery}.ts`; wiring in `index.ts` (chatTools append / execute `mcp__` routing / `mcpReadAllow`), `agent/safety/{policy,gate}.ts` (`readAllow`), `app/api/chat/route.ts`; API `app/api/connectors/mcp/route.ts`; UI `components/connectors/McpServersSection.tsx`.

## Status
Built + verified (**tsc clean, 1024 tests**). **Live verification against a real MCP server = operator handoff.** Merging branch → `main` next.

## Why it fit cleanly
The static registry's `resolveKind` already fails closed (unknown name → write), so MCP's fail-closed default needed NO new gate — only the `readAllow` opt-in. P4a (self-declared `kind`) prepared the ground. See [[connectors-oauth]].

## Deferred / future
Workflow-node MCP exposure · admin-shared servers · MCP resources/prompts · live-verify.
