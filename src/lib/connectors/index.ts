// Connector framework — public API. All functions are USER-SCOPED.
// Credentials are read/written via store.ts (encrypted at rest) and connectors
// come from registry.ts. See types.ts for the locked contracts and
// docs/superpowers/specs/2026-06-12-connectors-oauth-multiprovider.md.
//
// A connector exposes TOOLS the chat model can call. When the model emits a
// tool_call, execute() runs the matching handler with the user's stored
// (decrypted) credentials and returns the result. Secrets are NEVER returned to
// the browser in clear — list() masks them (keep last 4).
//
// OAuth connectors store {access_token, refresh_token, expiry_at}; the access
// token is refreshed automatically inside execute()/testConnector() before each
// call, behind a Postgres advisory lock (rotating single-use refresh tokens —
// Atlassian/Zalo — would brick under concurrent refresh from dev+prod sharing
// one DB). A dead grant flips the connector to `needs_reconnect` so the UI can
// offer a one-click reconnect. Dual-mode (jira): manual token fields keep
// working as a fallback when OAuth is unconfigured or its grant dies.

import type { Connector, ConnectorListItem, ConnectorTool, ConnectorStatus } from "./types";
import { CONNECTORS } from "./registry";
import { getCreds, setCreds, delCreds } from "./store";
import { PROVIDERS } from "./oauth/registry";
import { OAuthError, type OAuthTokens } from "./oauth/types";
import { trelloAuthorizeConfigured } from "./oauth/trello";
import { withCredLock } from "./oauth/lock";
import { discoverForUser } from "./mcp/discovery";
import { getServer as getMcpServer } from "./mcp/store";
import { callTool as mcpCallTool } from "./mcp/client";

const BY_ID: Record<string, Connector> = Object.fromEntries(CONNECTORS.map((c) => [c.id, c]));
const TOOL_OWNER: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of CONNECTORS) for (const t of c.tools) m[t.function.name] = c.id;
  return m;
})();

// Every key the OAuth flow may write into a creds blob. Used when the user
// explicitly switches a dual-mode connector back to manual fields (spec §12.5a)
// and when a dead grant falls back to still-valid manual creds (§12.5c).
const OAUTH_KEYS = [
  "access_token",
  "refresh_token",
  "expiry_at",
  "scope",
  "cloud_id",
  "site_url",
  "slack_bot_user_id",
  "_connected",
  "_needsReconnect",
  "_account",
  "google_email",
] as const;

function stripOAuthKeys(creds: Record<string, string>): Record<string, string> {
  const out = { ...creds };
  for (const k of OAUTH_KEYS) delete out[k];
  return out;
}

function maskValue(v: string): string {
  const s = String(v ?? "");
  return s.length <= 4 ? "••••" : "••••" + s.slice(-4);
}

// Manual-mode connected = fields are DECLARED AND non-empty AND all present.
// The length check is load-bearing: [].every() is vacuously true, which would
// mark every field-less OAuth connector "connected" for every user (§12.1).
function manualComplete(def: Connector, creds: Record<string, string>): boolean {
  const f = def.auth.fields ?? [];
  return f.length > 0 && f.every((x) => creds[x.key]);
}

// Tri-state connection status (see ConnectorStatus). `needs_reconnect` applies
// to OAuth grants AND to revoked call-time tokens (slack/trello — §12.6).
function connectionStatus(def: Connector, creds: Record<string, string> | null): ConnectorStatus {
  if (!creds) return "disconnected";
  if (creds._needsReconnect === "true" && def.auth.type !== "none") return "needs_reconnect";
  if (def.auth.type === "oauth") {
    const provider = PROVIDERS[def.auth.provider ?? ""];
    const oauthConnected =
      creds._connected === "true" &&
      !!creds.access_token &&
      // providers with refresh need a refresh_token to count as durably connected
      (!provider?.refresh || !!creds.refresh_token);
    return oauthConnected || manualComplete(def, creds) ? "connected" : "disconnected";
  }
  if (def.auth.type === "token") {
    return manualComplete(def, creds) ? "connected" : "disconnected";
  }
  // no-auth (demo): connected only when explicitly enabled.
  return creds._connected === "true" ? "connected" : "disconnected";
}

// Refresh the OAuth access token if it's near expiry. Returns usable creds, or
// null when the grant is dead and no manual fallback exists (marks
// _needsReconnect so the UI shows "Reconnect").
// THROWS only on transient errors (network / 5xx) — callers wrap it.
async function ensureFreshOAuthCreds(
  def: Connector,
  userId: string,
  id: string,
  creds: Record<string, string>,
): Promise<Record<string, string> | null> {
  const provider = PROVIDERS[def.auth.provider ?? ""];
  // Provider without refresh (slack): the token never expires — passthrough.
  if (!provider?.refresh) return creds;
  const expiry = Date.parse(creds.expiry_at || "");
  if (Number.isFinite(expiry) && expiry - Date.now() > 60_000) return creds; // >60s of life left
  // Manual-mode creds (dual-mode jira): nothing to refresh — passthrough.
  if (!creds.refresh_token && !creds.access_token) {
    return manualComplete(def, creds) ? creds : null;
  }
  if (!creds.refresh_token) return null;

  // Advisory lock + double-check: another process (dev and prod share one DB)
  // may have already rotated this single-use refresh token (§12.2).
  return withCredLock(userId, id, async () => {
    const cur = (await getCreds(userId, id)) ?? creds;
    const exp2 = Date.parse(cur.expiry_at || "");
    if (Number.isFinite(exp2) && exp2 - Date.now() > 60_000) return cur;
    if (!cur.refresh_token) return manualComplete(def, cur) ? cur : null;
    try {
      const tok = await provider.refresh!(cur.refresh_token);
      const updated: Record<string, string> = {
        ...cur,
        access_token: tok.access_token,
        expiry_at: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString(),
      };
      // Rotating providers return a NEW single-use refresh_token — persist it
      // IMMEDIATELY, before any API call runs on the new access token.
      if (tok.refresh_token) updated.refresh_token = tok.refresh_token;
      if (tok.scope) updated.scope = tok.scope;
      delete updated._needsReconnect;
      await setCreds(userId, id, updated);
      return updated;
    } catch (e) {
      if (e instanceof OAuthError && e.invalidGrant) {
        if (manualComplete(def, cur)) {
          // Dead grant but valid manual fields → keep working in manual mode (§12.5c)
          const stripped = stripOAuthKeys(cur);
          await setCreds(userId, id, stripped);
          return stripped;
        }
        await setCreds(userId, id, { ...cur, _needsReconnect: "true" });
        return null;
      }
      throw e; // transient: let caller surface as a normal error (don't flag reconnect)
    }
  });
}

// Call-time revocation (spec §12.6): connectors whose tokens die without a
// refresh cycle (slack revoked by workspace, trello token revoked) throw
// OAuthError(invalidGrant=true) from handlers/test — flag the connector so the
// UI offers reconnect instead of showing "connected" forever.
async function flagReconnectOnRevoke(userId: string, id: string, e: unknown): Promise<boolean> {
  if (!(e instanceof OAuthError && e.invalidGrant)) return false;
  const cur = (await getCreds(userId, id)) ?? {};
  await setCreds(userId, id, { ...cur, _needsReconnect: "true" });
  return true;
}

export async function isConnected(userId: string, id: string): Promise<boolean> {
  const def = BY_ID[id];
  if (!def) return false;
  return connectionStatus(def, await getCreds(userId, id)) === "connected";
}

export async function list(userId: string): Promise<ConnectorListItem[]> {
  const out: ConnectorListItem[] = [];
  for (const def of CONNECTORS) {
    const creds = (await getCreds(userId, def.id)) ?? {};
    const fields = def.auth.fields ?? [];
    const status = connectionStatus(def, creds);
    // The authorize button only renders when the operator env is in place.
    // trello is the one token-type connector with an authorize accelerator.
    const oauthConfigured =
      def.auth.type === "oauth"
        ? !!PROVIDERS[def.auth.provider ?? ""]?.configured()
        : def.id === "trello"
          ? trelloAuthorizeConfigured()
          : false;
    out.push({
      id: def.id,
      name: def.name,
      icon: def.icon || "plug",
      blurb: def.blurb || "",
      auth: {
        type: def.auth.type || "token",
        provider: def.auth.provider || "",
        scopes: def.auth.scopes || [],
        help: def.auth.help || "",
        setup: def.auth.setup || "",
        oauthConfigured,
        fields: fields.map((f) => ({
          key: f.key,
          label: f.label,
          placeholder: f.placeholder || "",
          secret: !!f.secret,
          // never send the raw value back — only a masked hint when present
          set: !!creds[f.key],
          masked: creds[f.key] ? (f.secret ? maskValue(creds[f.key]) : creds[f.key]) : "",
        })),
      },
      tools: def.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
      status,
      connected: status === "connected",
      account: creds._account || creds.google_email || null,
      connectedAt: creds._connectedAt || null,
    });
  }
  return out;
}

export async function connect(
  userId: string,
  id: string,
  fields: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const def = BY_ID[id];
  if (!def) return { ok: false, error: "unknown connector" };
  const declared = def.auth.fields ?? [];
  // Field-less OAuth connectors are connected via the redirect flow only.
  if (def.auth.type === "oauth" && declared.length === 0) {
    return { ok: false, error: 'connector này dùng OAuth — bấm nút "Kết nối"' };
  }
  const creds = (await getCreds(userId, id)) ?? {};
  for (const f of declared) {
    const v = fields?.[f.key];
    if (typeof v === "string" && v.trim()) creds[f.key] = v.trim();
  }
  // Re-entering fields is an explicit (re)connect — clear a stale revoked flag.
  delete creds._needsReconnect;
  let next = creds;
  if (def.auth.type === "oauth") {
    // Dual-mode manual save: a COMPLETE field set is an explicit mode switch —
    // drop the competing OAuth grant so the blob never mixes modes (§12.5a).
    // Deliberately NO `_connected = "true"` here — that marker belongs to the
    // OAuth flow only (§12.1).
    if (manualComplete(def, creds)) next = stripOAuthKeys(creds);
  } else if (def.auth.type !== "token") {
    next._connected = "true"; // demo: explicit enable
  }
  next._connectedAt = new Date().toISOString();
  try {
    await setCreds(userId, id, next);
  } catch {
    return { ok: false, error: "không lưu được credential" };
  }
  return { ok: true };
}

export async function disconnect(userId: string, id: string): Promise<{ ok: boolean }> {
  await delCreds(userId, id);
  return { ok: true };
}

export async function testConnector(
  userId: string,
  id: string,
): Promise<{ ok: boolean; info?: string; error?: string }> {
  const def = BY_ID[id];
  if (!def) return { ok: false, error: "unknown connector" };
  let creds = await getCreds(userId, id);
  if (connectionStatus(def, creds) !== "connected") return { ok: false, error: "chưa nhập credential" };
  if (def.auth.type === "oauth") {
    try {
      const fresh = await ensureFreshOAuthCreds(def, userId, id, creds ?? {});
      if (!fresh) return { ok: false, error: "phiên đăng nhập hết hạn — cần kết nối lại" };
      creds = fresh;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (typeof def.test !== "function")
    return { ok: true, info: "đã lưu credential (connector này không có kiểm tra)" };
  try {
    const r = await def.test(creds ?? {});
    return r && r.ok
      ? { ok: true, info: r.info || "kết nối OK" }
      : { ok: false, error: (r && r.error) || "kiểm tra thất bại" };
  } catch (e) {
    if (await flagReconnectOnRevoke(userId, id, e)) {
      return { ok: false, error: "token đã bị thu hồi — cần kết nối lại" };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Tools of every CONNECTED connector for this user, to pass to the model.
export async function chatTools(userId: string): Promise<ConnectorTool[]> {
  const out: ConnectorTool[] = [];
  for (const def of CONNECTORS) {
    if (await isConnected(userId, def.id)) out.push(...def.tools);
  }
  // MCP servers (per-user, dynamic). Best-effort: a down server yields no tools.
  try {
    const { tools } = await discoverForUser(userId);
    out.push(...tools);
  } catch {
    /* MCP discovery failure must not break chat tool listing */
  }
  return out;
}

// Names of MCP tools the user opted to trust as read (fed to the safety gate's
// readAllow so they skip the write confirm-card). Everything else stays fail-closed.
export async function mcpReadAllow(userId: string): Promise<ReadonlySet<string>> {
  try {
    return (await discoverForUser(userId)).readAllow;
  } catch {
    return new Set();
  }
}

// Route an MCP tool call (mcp__<slug>__<tool>) to the user's configured MCP server.
async function executeMcp(userId: string, toolName: string, args: unknown): Promise<unknown> {
  let route: Map<string, { slug: string; realName: string }>;
  try {
    route = (await discoverForUser(userId)).route;
  } catch {
    return { error: "không khám phá được MCP server" };
  }
  const r = route.get(toolName);
  if (!r) return { error: "tool MCP không tồn tại: " + toolName };
  const cfg = await getMcpServer(userId, r.slug);
  if (!cfg) return { error: 'MCP server "' + r.slug + '" chưa cấu hình' };
  let a: unknown = args;
  if (typeof a === "string") {
    try {
      a = JSON.parse(a);
    } catch {
      a = {};
    }
  }
  try {
    return await mcpCallTool(cfg, r.realName, (a as Record<string, unknown>) ?? {});
  } catch (e) {
    return { error: "lỗi gọi MCP " + toolName + ": " + (e instanceof Error ? e.message : String(e)) };
  }
}

// Run a tool the model asked for. `args` may be an object or a JSON string.
export async function execute(userId: string, toolName: string, args: unknown): Promise<unknown> {
  if (toolName.startsWith("mcp__")) return executeMcp(userId, toolName, args);
  const id = TOOL_OWNER[toolName];
  const def = id ? BY_ID[id] : undefined;
  if (!def || typeof def.handlers[toolName] !== "function") {
    return { error: "tool không tồn tại: " + toolName };
  }
  let creds = await getCreds(userId, id);
  if (connectionStatus(def, creds) !== "connected") {
    return { error: 'connector "' + id + '" chưa được kết nối' };
  }
  if (def.auth.type === "oauth") {
    try {
      const fresh = await ensureFreshOAuthCreds(def, userId, id, creds ?? {});
      if (!fresh) return { error: 'connector "' + id + '" cần kết nối lại (phiên đăng nhập hết hạn)' };
      creds = fresh;
    } catch (e) {
      return { error: "lỗi refresh token: " + (e instanceof Error ? e.message : String(e)) };
    }
  }
  let a: unknown = args;
  if (typeof a === "string") {
    try {
      a = JSON.parse(a);
    } catch {
      a = {};
    }
  }
  try {
    return await def.handlers[toolName]((a as Record<string, unknown>) ?? {}, creds ?? {});
  } catch (e) {
    if (await flagReconnectOnRevoke(userId, id, e)) {
      return { error: 'token của "' + id + '" đã bị thu hồi — vào trang Kết nối để kết nối lại' };
    }
    return { error: "lỗi khi gọi " + toolName + ": " + (e instanceof Error ? e.message : String(e)) };
  }
}

// ── OAuth route helpers (used by /api/connectors/[id]/[action] handlers) ──

export function isOAuthConnector(id: string): boolean {
  return BY_ID[id]?.auth.type === "oauth";
}

export function oauthScopes(id: string): string[] {
  return BY_ID[id]?.auth.scopes ?? [];
}

export function oauthProviderOf(id: string): string | null {
  return BY_ID[id]?.auth.provider ?? null;
}

// Persist tokens from an OAuth callback. Preserves an existing refresh_token if
// the provider didn't return a new one; folds in provider enrichment
// (cloud_id/site_url/_account/…). Manual fields are kept — OAuth wins at read
// time while its grant is alive (§12.5b).
export async function saveOAuthTokens(
  userId: string,
  id: string,
  providerId: string,
  tok: OAuthTokens,
): Promise<void> {
  const provider = PROVIDERS[providerId];
  const prev = (await getCreds(userId, id)) ?? {};
  let enriched: Record<string, string> = {};
  if (provider?.enrich) {
    enriched = await provider.enrich(tok); // throws → callback redirects to oauth_exchange
  }
  const creds: Record<string, string> = {
    ...prev,
    ...enriched,
    access_token: tok.access_token,
    _connected: "true",
    _connectedAt: new Date().toISOString(),
  };
  if (tok.expires_in) {
    creds.expiry_at = new Date(Date.now() + tok.expires_in * 1000).toISOString();
  } else {
    delete creds.expiry_at; // non-expiring token (slack)
  }
  if (tok.refresh_token) creds.refresh_token = tok.refresh_token;
  if (tok.scope) creds.scope = tok.scope;
  delete creds._needsReconnect;
  await setCreds(userId, id, creds);
}

// Trello capture (authorize accelerator): persist ordinary token-mode creds
// after the route verified the captured token (oauth/trello.ts).
export async function saveTrelloToken(userId: string, token: string, apiKey: string): Promise<void> {
  const prev = (await getCreds(userId, "trello")) ?? {};
  const creds: Record<string, string> = {
    ...prev,
    key: apiKey,
    token,
    _connectedAt: new Date().toISOString(),
  };
  delete creds._needsReconnect;
  await setCreds(userId, "trello", creds);
}
