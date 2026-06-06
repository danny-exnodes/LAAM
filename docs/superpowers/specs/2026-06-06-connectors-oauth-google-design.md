# Connectors — fix & improve (OAuth-first) — Design

**Date:** 2026-06-06
**Author:** tech-lead session (autonomous build)
**Status:** approved (user delegated full authority to implement)

## 1. Context

The Connectors feature (`src/lib/connectors/*`, `src/app/connectors`, `src/app/api/connectors`)
exposes external-service TOOLS the chat model + workflow engine can call. Audit found:

- 🔴 Card icon renders the **first letter of the Lucide icon name** (`(c.icon||c.name).slice(0,1)`), not the icon.
- 🔴 The `auth.type === "oauth"` UI branch is **dead code** — 0/7 connectors use it.
- 🔴 Google connectors (gcal/gdrive/gmail) declare `type:"token"` but ask the user to paste a
  **1-hour OAuth Playground access token** — unusable for daily work.
- 🟠 Connector-supplied strings (`name`/`blurb`/`help`) are **hardcoded Vietnamese** (no i18n).
- 🟠 No busy/disabled state; `disconnect` swallows errors.
- 🟢 Read surface is thin (1–3 tools/connector); only `demo`+`trello` have write tools.

The SP-2 write-gate (`src/lib/agent/safety/{gate,policy}.ts`) is **already built and write-ready**:
`withSafety()` throws `PendingWriteSignal` for unconfirmed writes; `resolveKind()` classifies
read/write and **fails closed** (unknown → write). Both chat (`makeDispatch`) and workflow
(`assertConnectorAllowed` → `connectorExecute`) converge on `execute()` + `resolveKind()`.

## 2. Roadmap (decided)

Strategy: **OAuth-first**; polish slots in; capability expansion planned now, writes deferred.

| Phase | Content | Risk |
|---|---|---|
| P1 | UI polish: Lucide icons, busy-state, disconnect handling, render 3-state status | low |
| P2 | i18n connector content (vi/en/zh) | low |
| **P3** | **OAuth Google in-app** (Testing-mode, 3 connectors) — THIS BUILD | med |
| P4a | Contract `kind` self-declaration (write-ready backbone) — THIS BUILD | low |
| P4b | Read-tools expansion per connector | low |
| P5 | Write actions (gated by write-gate; enable when write perms granted) | high (deferred) |

Account context = **personal Gmail** → External app, **Testing** publishing status. Verified Google
policy: External+Testing refresh tokens expire in **~7 days**; `gmail.readonly`/`drive.readonly` are
**restricted** scopes (publishing needs paid CASA audit). Decision: **stay in Testing mode, design a
painless one-click "Reconnect"**, never pursue CASA for a <50-user self-hosted tool.

## 3. P3 — OAuth design

### 3.1 Token model — reuse store, no schema change
Per-connector grants (one OAuth grant per Google connector → one encrypted `(userId, connectorId)`
row). `store.ts` encrypts arbitrary JSON, so the blob holds:

```jsonc
{ "access_token", "refresh_token", "expiry_at" /*ISO*/, "scope",
  "google_email", "_connected":"true", "_connectedAt", "_needsReconnect"? }
```

### 3.2 Contract changes (`types.ts`)
```ts
export type ConnectorTool = {
  type: "function";
  kind: "read" | "write";          // NEW — self-declared; policy derives classification
  function: { name: string; description: string; parameters: object };
};
export type ConnectorAuth = {
  type: "token" | "oauth" | "none";
  provider?: "google";             // NEW
  scopes?: string[];               // NEW (oauth)
  help?: string; setup?: string; fields?: ConnectorField[];
};
export type ConnectorStatus = "connected" | "needs_reconnect" | "disconnected"; // NEW
export type ConnectorListItem = {
  /* …existing… */
  connected: boolean;              // keep = (status==="connected") for back-compat
  status: ConnectorStatus;         // NEW
  account: string | null;          // NEW (e.g. google_email)
  connectedAt: string | null;
};
```
Handler signature **unchanged** `(args, creds)` — refresh happens in `execute()`, so handlers
always receive fresh creds.

### 3.3 Policy refactor (`safety/policy.ts`)
Replace hardcoded `CONNECTOR_WRITES`/`CONNECTOR_READS` sets with a registry-derived map:
```ts
import { CONNECTORS } from "@/lib/connectors/registry";
const CONNECTOR_KIND = new Map(
  CONNECTORS.flatMap(c => c.tools.map(t => [t.function.name, t.kind])));
export function resolveKind(name, internal) {
  const tool = internal.find(t => t.name === name);
  if (tool) return tool.kind;
  const k = CONNECTOR_KIND.get(name);
  if (k) return k;
  console.warn(`[safety] tool chưa phân loại, mặc định GATE (write): ${name}`);
  return "write"; // fail-closed preserved
}
```
Acyclic: connectors → only `./types`; safety → connectors/registry (no DB pulled in).
`resolveBlast`/`BLAST_LOW` unchanged. `policy.test.ts` updated to assert via `resolveKind`.

### 3.4 Flow — extend existing `[id]/[action]` route with a GET handler
No new route files (avoids `[id]/[action]` routing conflicts). `redirect_uri` =
`${OAUTH_PUBLIC_BASE_URL}/api/connectors/google/callback` (id="google", action="callback").

```
[Card] "Kết nối với Google" → GET /api/connectors/:id/authorize
   • config from env; build consent URL (scope per connector,
     access_type=offline & prompt=consent, state, PKCE S256)
   • set encrypted httpOnly cookie {state, codeVerifier, connectorId} TTL 10'
   • 302 → accounts.google.com/o/oauth2/v2/auth
→ GET /api/connectors/google/callback?code&state
   • verify state ↔ cookie; exchange code+verifier → tokens
   • saveGoogleTokens(userId, connectorId, tokens, email)
   • 302 → /connectors?connected=:id
```

### 3.5 Shared helper `src/lib/connectors/google-oauth.ts`
```ts
export type GoogleTokens = { access_token; refresh_token?; expires_in; scope?; };
export function googleOAuthConfig(): {clientId;clientSecret;redirectUri} | null; // env; null if unset
export function pkcePair(): { verifier: string; challenge: string };            // node crypto
export function randomState(): string;
export function buildAuthUrl(o:{scopes:string[];state:string;codeChallenge:string}): string;
export async function exchangeCode(o:{code:string;codeVerifier:string}): Promise<GoogleTokens>;
export async function refreshAccessToken(refreshToken:string): Promise<GoogleTokens>; // throws GoogleAuthError on invalid_grant
export class GoogleAuthError extends Error { invalidGrant: boolean }
```
`gapi()` in the 3 connectors stays (reads `creds.access_token`); only its base URL differs.

### 3.6 Refresh & reconnect lifecycle (`index.ts`)
Single chokepoint `execute()` (used by chat dispatch AND workflow). Pre-flight before handler:
```
if def.auth.type==="oauth":
  creds = await ensureFreshGoogleCreds(userId, id, creds)   // refresh if expiry_at within ~60s
    → on success: setCreds(updated access_token+expiry_at)
    → on GoogleAuthError.invalidGrant: setCreds({_needsReconnect:"true"}); return {error:"connector cần kết nối lại"}
```
`testConnector()` runs the same pre-flight. `list()`/`isConnected()` compute status:
- oauth: refresh_token & !_needsReconnect & _connected → `connected`; _needsReconnect → `needs_reconnect`; else `disconnected`
- token: all fields present → `connected` else `disconnected`
- none: `_connected==="true"` → `connected` else `disconnected`

### 3.7 Connector edits (gcal/gdrive/gmail)
`auth.type: "token"` → `"oauth"`, drop paste `fields`, add `provider:"google"` + `scopes:[...]`,
add `setup` help text. Add `kind:"read"` to every tool. Scopes:
- calendar → `calendar.readonly`; drive → `drive.readonly`; gmail → `gmail.readonly`

### 3.8 UI (`ConnectorsClient.tsx`) — folds in P1
- Render real **Lucide** icon by `c.icon` name (vendored set) instead of `.slice(0,1)`.
- `oauth` branch → real **"Kết nối với Google"** anchor → `/api/connectors/:id/authorize`.
- 3-state: connected (green + account + Test/Disconnect) · needs_reconnect (amber "Kết nối lại") · disconnected.
- Busy/disabled state during connect/test/disconnect; surface disconnect errors; read `?connected=`/`?error=` toast.

### 3.9 Env + operator one-time setup (README/.env.example)
```
GOOGLE_OAUTH_CLIENT_ID=…
GOOGLE_OAUTH_CLIENT_SECRET=…
OAUTH_PUBLIC_BASE_URL=https://<host>     # no trailing slash
```
Operator (one-time): Google Cloud Console → OAuth client (Web) → consent screen External + Testing →
add team as **Test users** → add scopes (calendar.readonly, drive.readonly, gmail.readonly) →
register redirect URIs: `${OAUTH_PUBLIC_BASE_URL}/api/connectors/google/callback`
(+ `http://localhost:3100/api/connectors/google/callback` for dev).

### 3.10 Test plan (Vitest, mock `fetch`, no live Google)
- `google-oauth.test.ts`: auth-url params (offline/consent/scope/state/PKCE); exchange→tokens; refresh
  success; refresh `invalid_grant`→`GoogleAuthError.invalidGrant`.
- `index.test.ts`: oauth status derivation (3 states); `execute()` refresh-on-expiry persists new token;
  `execute()` invalid_grant → `_needsReconnect` + error result; fresh token NOT refreshed.
- `policy.test.ts`: `resolveKind` reads kinds from registry; unknown → write (fail-closed).
- Route GET test: authorize redirects to Google with cookie; callback verifies state + saves tokens.

## 4. P4 framework (read now / write deferred)
- `kind` self-declared on every tool (done in P4a). Adding a tool = edit ONE connector file
  (conflict-free) → policy auto-classifies.
- P4b read candidates (high-value): github(get_repo,list_prs,list_commits,get_file_content,code_search),
  calendar(list_calendars,search_events), drive(read_file_content), gmail(get_message,get_thread,list_labels),
  trello(list_lists,get_card), jira(get_issue,list_projects,transitions).
- P5 write candidates designed but NOT enabled: add handler + `kind:"write"` (+ `BLAST_LOW` if safe).
  `gmail.send` depends on P3 (OAuth write scope, re-consent).

## 5. Out of scope / handoffs
- Live Google round-trip verification (operator: env + Console + run server).
- Write-tool enablement (needs user-granted write perms).
- Google app verification/CASA (deliberately not pursued).
