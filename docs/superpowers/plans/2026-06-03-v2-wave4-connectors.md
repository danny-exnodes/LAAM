# V2 Wave 4 — Connectors Implementation Plan (final wave)

> **Coordination plan.** Built from scratch (v2 has zero connectors). TL prep locks the schema + `types.ts` + stub `index.ts`/`registry.ts` so 5 agents fan out against stable interfaces. The framework is Postgres-backed, **per-user, encrypted-at-rest** (v1 used a local mode-600 JSON file — v2 must not).

**Goal:** v1 parity for connectors: a `/connectors` page (list/connect/disconnect/test), per-user encrypted credential storage, the framework + 7 connectors (demo/github/trello/jira/google-drive/google-calendar/gmail), and the chat **tool-calling loop** so the model can invoke connector tools.

**Architecture:** `lib/connectors/` — `types.ts` (Connector contract), `crypto.ts` (AES-256-GCM via node:crypto, key from env), `store.ts` (Drizzle CRUD on `connector_credentials`, encrypted), `registry.ts` (explicit array of the 7 modules), `index.ts` (user-scoped `list/isConnected/connect/disconnect/testConnector/chatTools/execute`). API routes call the framework; `/connectors` page is client UI; `/api/chat` runs a bounded tool-loop using `chatTools(userId)`/`execute(userId,…)`.

**Tech Stack:** existing only. node:crypto for encryption. **DB migration must be generated on the host** (`npm run db:generate` — drizzle-kit can't run in the agent sandbox); the table won't exist live until the user migrates. Tests mock the DB.

## TL prep (before spawning — commit first)
- Add `connectorCredentials` table to `schema.ts`: `{ id, userId (fk), connectorId (text), secret (text, encrypted blob), createdAt, updatedAt }`, unique (userId, connectorId).
- `lib/connectors/types.ts` — LOCKED `Connector`, `ConnectorTool`, `ConnectorListItem` (browser-safe), framework fn signatures.
- `lib/connectors/registry.ts` — `export const CONNECTORS: Connector[] = []` (connectors agent fills).
- `lib/connectors/index.ts` — STUB exports with correct signatures (framework agent implements).

## Shared Interfaces (LOCKED) — `@/lib/connectors/types`
```ts
export type ConnectorField = { key: string; label: string; placeholder?: string; secret?: boolean };
export type ConnectorAuth = { type: "token" | "oauth" | "none"; help?: string; setup?: string; fields?: ConnectorField[] };
export type ConnectorTool = { type: "function"; function: { name: string; description: string; parameters: object } };
export type Connector = {
  id: string; name: string; icon: string; blurb: string;
  auth: ConnectorAuth;
  tools: ConnectorTool[];
  handlers: Record<string, (args: Record<string, unknown>, creds: Record<string, string>) => Promise<unknown>>;
  test?: (creds: Record<string, string>) => Promise<{ ok: boolean; info?: string; error?: string }>;
};
export type ConnectorListItem = { // browser-safe (NO raw secrets — masked only)
  id: string; name: string; icon: string; blurb: string;
  auth: { type: string; help: string; setup: string;
          fields: { key: string; label: string; placeholder: string; secret: boolean; set: boolean; masked: string }[] };
  tools: string[]; connected: boolean; connectedAt: string | null;
};
// framework (index.ts) — ALL user-scoped:
export function list(userId: string): Promise<ConnectorListItem[]>;
export function isConnected(userId: string, id: string): Promise<boolean>;
export function connect(userId: string, id: string, fields: Record<string, string>): Promise<{ ok: boolean; error?: string }>;
export function disconnect(userId: string, id: string): Promise<{ ok: boolean }>;
export function testConnector(userId: string, id: string): Promise<{ ok: boolean; info?: string; error?: string }>;
export function chatTools(userId: string): Promise<ConnectorTool[]>;
export function execute(userId: string, toolName: string, args: unknown): Promise<unknown>;
```

v1 source to port: `lib/connectors/index.js` (framework logic), `lib/connectors/{demo,github,trello,jira,google-drive,google-calendar,gmail}.js` (modules), `bin/laam.js` tool-loop (~1163-1217) + `/api/connectors` routes (~1143-1150), `public/connectors.js` + `public/i18n.connectors.js` (UI, 17 keys ported to `dictionaries/connectors.ts`).

---

## Package W4-F — framework — OWNER: agent `framework`
**Files (owns):** `lib/connectors/crypto.ts`, `lib/connectors/store.ts`, MODIFY `lib/connectors/index.ts` (implement the stubs) + tests.
**Sub-plan. Must include:**
- [ ] crypto.ts: AES-256-GCM `encryptJson(obj)→string` / `decryptJson(string)→obj` using a 32-byte key derived (scrypt/sha256) from `process.env.CONNECTOR_KEY ?? process.env.AUTH_SECRET`. iv+tag packed into the blob. Round-trip + tamper test.
- [ ] store.ts: `getCreds(userId,id)→Record<string,string>|null`, `setCreds(userId,id,creds)`, `delCreds(userId,id)` — Drizzle upsert on (userId,connectorId), value = encryptJson(creds). Tests mock db.
- [ ] index.ts: implement list/isConnected/connect/disconnect/testConnector/chatTools/execute per the locked signatures, porting v1 logic (mask secrets in list — keep last 4; token connectors connected when all required fields set; demo/oauth connected when `_connected`). Build the tool→connector owner map from CONNECTORS. Tests with a fake connector + mocked store.
**Success:** `npx vitest run src/lib/connectors` green.

## Package W4-C — 7 connector modules — OWNER: agent `connectors`
**Files (owns):** `lib/connectors/{demo,github,trello,jira,google-drive,google-calendar,gmail}.ts` + `lib/connectors/registry.ts` (import all 7 → CONNECTORS) + tests.
**Sub-plan. Must include:**
- [ ] Port each v1 connector module to a typed `Connector` (default export or named). Keep tool names/params identical to v1 (github_list_repos, trello_list_boards, jira_search_issues, gdrive_list_files, gcal_list_events, gmail_list_messages, demo_list_tasks, …). Fetch real APIs with the user's creds + 12s timeout + UA.
- [ ] registry.ts: `export const CONNECTORS: Connector[] = [demo, github, trello, jira, gdrive, gcal, gmail]`.
- [ ] Tests: each connector has id/auth/tools; a handler maps a mocked API response (mock fetch); demo works offline.
**Success:** `npx vitest run src/lib/connectors` (your connector + registry tests) green.

## Package W4-A — API routes — OWNER: agent `connapi`
**Files (owns):** `app/api/connectors/route.ts` (GET list), `app/api/connectors/[id]/[action]/route.ts` (POST connect/disconnect/test) + tests.
**Sub-plan. Must include:**
- [ ] GET /api/connectors → auth() → `list(userId)`. POST /api/connectors/:id/:action → auth() → action ∈ {connect (body fields → connect), disconnect, test}; 400 on bad action. Never echo raw secrets.
- [ ] Tests: 401 unauth; action routing (mock framework fns).
**Success:** `npx vitest run src/app/api/connectors` green.

## Package W4-U — /connectors page + i18n — OWNER: agent `connui`
**Files (owns):** `app/connectors/page.tsx` (thin auth shell), `components/connectors/ConnectorsClient.tsx` + sub-components + tests. May ADD missing keys to `dictionaries/connectors.ts` (vi/en/zh).
**Sub-plan. Must include:**
- [ ] ConnectorsClient (client): fetch GET /api/connectors → cards per connector (icon/name/blurb/connected badge/tool list); connect form (auth.fields, secret inputs show masked hint); connect/disconnect/test buttons → POST; test shows ok/error inline. useT(connectors).
- [ ] page.tsx: auth guard + AppHeader + ConnectorsClient. Add `/connectors` to AppHeader nav if trivial (else note).
- [ ] RTL tests: renders connectors from mocked fetch; connect submits fields; disconnect/test call endpoints (mock fetch).
**Success:** `npx vitest run src/components/connectors` green.

## Package W4-T — chat tool-loop — OWNER: agent `toolloop`
**Files (owns):** MODIFY `app/api/chat/route.ts` (add the tool-calling loop) + tests.
**Sub-plan. Must include:**
- [ ] Before streaming: `const tools = await chatTools(userId)`. If tools present, run a bounded loop (max ~4 rounds): call Ollama `/api/chat` (non-stream) with `tools`; if the model returns `tool_calls`, `execute(userId, name, args)` each, append tool results as `{role:"tool", content}` messages, loop; else break. THEN stream the final answer (reuse existing streaming path) + persist. If no tools, behave exactly as today (surgical — don't break the no-connector path).
- [ ] Factor the loop into a pure-ish helper where possible; test the round logic with a mocked Ollama + mocked execute (tool_call → execute → final answer). Keep buildOllamaPayload usage.
**Success:** `npx vitest run src/app/api/chat` green; no-connector path unchanged.

---

## TL integration (after F+C+A+U+T)
- [ ] `cd v2 && npm test` (all green) + `npm run build` (clean).
- [ ] Generate migration on host note: `npm run db:generate && npm run db:migrate` (user runs — table needed for live).
- [ ] Manual (after migrate): /connectors connect GitHub (PAT) → /chat ask "list my repos" → model calls github_list_repos → rendered.
- [ ] Update roadmap (Wave 4 done → v1 parity complete) + Serena + checkpoint; commit per package + integration; push.

## Parallel safety
Disjoint: F owns crypto/store/index; C owns 7 modules + registry; A owns api/connectors; U owns connectors page+components; T owns api/chat. types.ts + schema locked by TL prep. A/T import framework fns from index.ts (stubs exist from prep → tsc resolves; real impl lands from F). chat dict / connectors dict: U adds missing keys only. Agents run only their own tests; don't commit.
