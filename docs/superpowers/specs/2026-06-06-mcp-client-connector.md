# P6 — MCP-client connector type (LAAM as MCP client) — Design

**Date:** 2026-06-06 · **Status:** approved (user delegated full authority to implement)
Builds on the connector framework + SP-2 safety layer (see
`2026-06-06-connectors-oauth-google-design.md`).

## 1. Goal & approved decisions
Let a LAAM user plug external **MCP servers** so their tools appear in LAAM chat,
wrapped in the existing safety layer.
- **Transport:** HTTP — `StreamableHTTPClientTransport` (fallback `SSEClientTransport`). LAAM is an HTTP client; no child processes.
- **Auth/ownership:** per-user. Each user adds their own server(s) + optional token, stored encrypted.
- **`kind` trust:** FAIL-CLOSED — every MCP tool is `write` (gated) by default; per-server opt-in `trustReadHints` makes `readOnlyHint:true` tools count as `read`.
- **Scope v1:** multiple servers/user; **chat-only** (NOT exposed to workflow nodes yet); admin-shared deferred.

## 2. Storage (zero schema change)
Reuse `connector_credentials`: one row per server, `connectorId = "mcp:<slug>"`,
`secret = encryptJson({ name, url, authToken?, trustReadHints: boolean })`. Enumerate a
user's servers = rows where connectorId starts with `mcp:`.

## 3. Module layout — `src/lib/connectors/mcp/`
```
types.ts      McpServerConfig, McpDiscoveredTool
store.ts      listServers(userId), getServer(userId, slug), addServer(userId, cfg), removeServer(userId, slug)
client.ts     withClient(cfg, fn) — connect (StreamableHTTP→SSE fallback), run fn(client), always close.
              listTools(cfg) → McpDiscoveredTool[]; callTool(cfg, name, args) → unknown (shaped from result.content)
discovery.ts  discoverForUser(userId) → { tools: ConnectorTool[]; readAllow: Set<string>; byTool: Map<name,{slug}> }
              (connect each server, list, namespace name `mcp__<slug>__<tool>`, map kind, build readAllow; cached per-user ~30s)
ssrf.ts       assertSafeUrl(url) — block localhost/private-IP/link-local/metadata (reuse fetch-url guard pattern)
```

### Verified MCP SDK usage (`@modelcontextprotocol/sdk` v1.x)
```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
const client = new Client({ name: "laam", version: "2.0" });
const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
  requestInit: cfg.authToken ? { headers: { Authorization: `Bearer ${cfg.authToken}` } } : undefined,
});
await client.connect(transport);                 // try Streamable, catch → SSEClientTransport
const { tools } = await client.listTools();        // tool: { name, description?, inputSchema, annotations?: { readOnlyHint?, destructiveHint? } }
const res = await client.callTool({ name, arguments });  // res.content: [{type:"text",text}|...]
await client.close();
```
Tool result shaping: join `content[]` text blocks; pass structured blocks through as-is; bounded by `boundOutput`.

## 4. kind mapping (fail-closed + opt-in)
```
kind(tool, server) = (server.trustReadHints && tool.annotations?.readOnlyHint === true) ? "read" : "write"
```
Namespaced name `mcp__<slug>__<tool>`. `readAllow` = set of namespaced names whose kind === "read".

## 5. Wiring into the framework
- `chatTools(userId)` → append `discoverForUser(userId).tools` (best-effort; a down server logs + yields none).
- `execute(userId, name, args)` → if `name.startsWith("mcp__")` → resolve `{slug}` from discovery map → `mcp.callTool(cfg, realName, args)`; wrap result via existing `redact(boundOutput())` (already in withSafety). Errors → `{ error }` (execute never throws).
- `withSafety` / `SafetyOptions` → add `readAllow?: ReadonlySet<string>`. `resolveKind` for an `mcp__` name: in `readAllow` → "read", else "write" (fail-closed — the default already does this for unknown names; readAllow is the opt-in override).
- chat route (`/api/chat`) → compute `readAllow` from `discoverForUser(userId)` and pass into `withSafety({ internal, readAllow })`. (Confirm-path resume already carries `confirmedAction`.)
- `policy.ts resolveKind(name, internal, readAllow?)` gains an optional 3rd arg (default behavior unchanged when omitted → fail-closed for mcp names). Workflow `assertConnectorAllowed` passes no readAllow → MCP writes stay HIGH/fail-closed there (chat-only v1 anyway; defense in depth).
- `list(userId)` → also project MCP servers as `ConnectorListItem`s (id `mcp:<slug>`, name, status connected/needs_reconnect via a reachability probe, tools = discovered names) so the UI lists them with the others.

## 6. API route (per-user CRUD)
`/api/connectors/mcp` (new): `GET` list user's MCP servers (masked token); `POST` add `{name,url,authToken?,trustReadHints}` (validate + `assertSafeUrl` + a probe connect); `DELETE ?slug=` remove. Session-auth like the other connector routes.

## 7. UI (`ConnectorsClient`)
A "MCP servers" section: list configured servers (name, url host, tools, reachable badge, remove), and an "Add MCP server" form (name, url, token, trust-read toggle). Reuse card styling. i18n keys vi/en/zh.

## 8. Safety recap
Fail-closed kind · confirm-card on writes · redact/bound all results · per-user encrypted config · SSRF guard on the user URL · chat-only (no workflow) v1.

## 9. Test plan (Vitest, mock the MCP client — no live server)
- client.ts: transport fallback; callTool content shaping; close-on-error.
- discovery.ts: namespacing; kind mapping (trust on/off × readOnlyHint); readAllow membership; down-server → empty.
- ssrf.ts: blocks localhost/private/metadata; allows public.
- index wiring: chatTools appends mcp tools; execute routes mcp__ → callTool + redact; unknown mcp tool → error.
- policy: resolveKind(mcp name) → write without readAllow, read with.
- route + UI: add/list/remove; validation + SSRF reject.

## 10. Phasing
P6a store+client+discovery+ssrf+kind (+tests) · P6b wiring (index/policy/gate/chat route) + readAllow (+tests) · P6c API route + UI (+tests). Deferred: workflow exposure, admin-shared, resources/prompts (tools only in v1).

## 11. Out of scope / handoffs
Live verification against a real MCP server (operator). MCP resources/prompts (v1 = tools only). Workflow-node MCP. Dependency added: `@modelcontextprotocol/sdk`.
