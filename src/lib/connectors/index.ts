// Connector framework — public API. All functions are USER-SCOPED.
// Credentials are read/written via store.ts (encrypted at rest) and connectors
// come from registry.ts. See types.ts for the locked contracts and
// docs/superpowers/specs/2026-06-06-connectors-oauth-google-design.md.
//
// A connector exposes TOOLS the chat model can call. When the model emits a
// tool_call, execute() runs the matching handler with the user's stored
// (decrypted) credentials and returns the result. Secrets are NEVER returned to
// the browser in clear — list() masks them (keep last 4).
//
// OAuth connectors (Google) store {access_token, refresh_token, expiry_at}; the
// access token is refreshed automatically inside execute()/testConnector() before
// each call. A dead refresh token (Google "Testing" apps drop them after ~7 days)
// flips the connector to `needs_reconnect` so the UI can offer a one-click reconnect.

import type { Connector, ConnectorListItem, ConnectorTool, ConnectorStatus } from "./types";
import { CONNECTORS } from "./registry";
import { getCreds, setCreds, delCreds } from "./store";
import { refreshAccessToken, GoogleAuthError, type GoogleTokens } from "./google-oauth";
import { discoverForUser } from "./mcp/discovery";
import { getServer as getMcpServer } from "./mcp/store";
import { callTool as mcpCallTool } from "./mcp/client";

const BY_ID: Record<string, Connector> = Object.fromEntries(CONNECTORS.map((c) => [c.id, c]));
const TOOL_OWNER: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of CONNECTORS) for (const t of c.tools) m[t.function.name] = c.id;
  return m;
})();

function maskValue(v: string): string {
  const s = String(v ?? "");
  return s.length <= 4 ? "••••" : "••••" + s.slice(-4);
}

// Tri-state connection status (see ConnectorStatus). `needs_reconnect` is OAuth-only.
function connectionStatus(def: Connector, creds: Record<string, string> | null): ConnectorStatus {
  if (!creds) return "disconnected";
  if (def.auth.type === "oauth") {
    if (creds._needsReconnect === "true") return "needs_reconnect";
    return creds.refresh_token && creds._connected === "true" ? "connected" : "disconnected";
  }
  // token connectors: every required field present.
  if (def.auth.type === "token") {
    return (def.auth.fields ?? []).every((f) => creds[f.key]) ? "connected" : "disconnected";
  }
  // no-auth (demo): connected only when explicitly enabled.
  return creds._connected === "true" ? "connected" : "disconnected";
}

// Refresh the Google access token if it's near expiry. Returns fresh creds, or null
// when the refresh token is dead (marks _needsReconnect so the UI shows "Reconnect").
// THROWS only on transient errors (network / 5xx) — callers wrap it.
async function ensureFreshGoogleCreds(
  userId: string,
  id: string,
  creds: Record<string, string>,
): Promise<Record<string, string> | null> {
  const expiry = Date.parse(creds.expiry_at || "");
  if (Number.isFinite(expiry) && expiry - Date.now() > 60_000) return creds; // >60s of life left
  if (!creds.refresh_token) return null;
  try {
    const tok = await refreshAccessToken(creds.refresh_token);
    const updated: Record<string, string> = {
      ...creds,
      access_token: tok.access_token,
      expiry_at: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString(),
    };
    if (tok.refresh_token) updated.refresh_token = tok.refresh_token;
    if (tok.scope) updated.scope = tok.scope;
    delete updated._needsReconnect;
    await setCreds(userId, id, updated);
    return updated;
  } catch (e) {
    if (e instanceof GoogleAuthError && e.invalidGrant) {
      await setCreds(userId, id, { ...creds, _needsReconnect: "true" });
      return null;
    }
    throw e; // transient: let caller surface as a normal error (don't flag reconnect)
  }
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
      account: creds.google_email || null,
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
  // OAuth connectors are connected via the redirect flow, not by posting fields.
  if (def.auth.type === "oauth") {
    return { ok: false, error: 'connector này dùng OAuth — bấm "Kết nối với Google"' };
  }
  const creds = (await getCreds(userId, id)) ?? {};
  for (const f of def.auth.fields ?? []) {
    const v = fields?.[f.key];
    if (typeof v === "string" && v.trim()) creds[f.key] = v.trim();
  }
  if (def.auth.type !== "token") creds._connected = "true"; // demo: explicit enable
  creds._connectedAt = new Date().toISOString();
  try {
    await setCreds(userId, id, creds);
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
      const fresh = await ensureFreshGoogleCreds(userId, id, creds ?? {});
      if (!fresh) return { ok: false, error: "phiên Google hết hạn — cần kết nối lại" };
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
      const fresh = await ensureFreshGoogleCreds(userId, id, creds ?? {});
      if (!fresh) return { error: 'connector "' + id + '" cần kết nối lại (phiên Google hết hạn)' };
      creds = fresh;
    } catch (e) {
      return { error: "lỗi refresh token Google: " + (e instanceof Error ? e.message : String(e)) };
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
    return { error: "lỗi khi gọi " + toolName + ": " + (e instanceof Error ? e.message : String(e)) };
  }
}

// ── OAuth route helpers (used by /api/connectors/[id]/[action] GET handler) ──

export function isOAuthConnector(id: string): boolean {
  return BY_ID[id]?.auth.type === "oauth";
}

export function oauthScopes(id: string): string[] {
  return BY_ID[id]?.auth.scopes ?? [];
}

// Persist tokens from an OAuth callback (or refresh). Preserves an existing
// refresh_token if Google didn't return a new one.
export async function saveGoogleTokens(
  userId: string,
  id: string,
  tok: GoogleTokens,
  email?: string | null,
): Promise<void> {
  const prev = (await getCreds(userId, id)) ?? {};
  const creds: Record<string, string> = {
    ...prev,
    access_token: tok.access_token,
    expiry_at: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString(),
    _connected: "true",
    _connectedAt: new Date().toISOString(),
  };
  if (tok.refresh_token) creds.refresh_token = tok.refresh_token;
  if (tok.scope) creds.scope = tok.scope;
  if (email) creds.google_email = email;
  delete creds._needsReconnect;
  await setCreds(userId, id, creds);
}
