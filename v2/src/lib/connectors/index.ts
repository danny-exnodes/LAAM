// Connector framework — public API. All functions are USER-SCOPED.
// Credentials are read/written via store.ts (encrypted at rest) and connectors
// come from registry.ts. See types.ts for the locked contracts and
// docs/superpowers/plans/2026-06-03-v2-wave4-connectors.md.
//
// A connector exposes TOOLS the chat model can call. When the model emits a
// tool_call, execute() runs the matching handler with the user's stored
// (decrypted) credentials and returns the result. Secrets are NEVER returned to
// the browser in clear — list() masks them (keep last 4).

import type { Connector, ConnectorListItem, ConnectorTool } from "./types";
import { CONNECTORS } from "./registry";
import { getCreds, setCreds, delCreds } from "./store";

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

function connectedFromCreds(def: Connector, creds: Record<string, string> | null): boolean {
  if (!creds) return false;
  // token connectors: every required field present.
  if (def.auth.type === "token") return (def.auth.fields ?? []).every((f) => creds[f.key]);
  // no-auth (demo) / oauth: connected only when explicitly enabled.
  return creds._connected === "true";
}

export async function isConnected(userId: string, id: string): Promise<boolean> {
  const def = BY_ID[id];
  if (!def) return false;
  return connectedFromCreds(def, await getCreds(userId, id));
}

export async function list(userId: string): Promise<ConnectorListItem[]> {
  const out: ConnectorListItem[] = [];
  for (const def of CONNECTORS) {
    const creds = (await getCreds(userId, def.id)) ?? {};
    const fields = def.auth.fields ?? [];
    out.push({
      id: def.id,
      name: def.name,
      icon: def.icon || "plug",
      blurb: def.blurb || "",
      auth: {
        type: def.auth.type || "token",
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
      tools: def.tools.map((t) => t.function.name),
      connected: connectedFromCreds(def, creds),
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
  const creds = (await getCreds(userId, id)) ?? {};
  for (const f of def.auth.fields ?? []) {
    const v = fields?.[f.key];
    if (typeof v === "string" && v.trim()) creds[f.key] = v.trim();
  }
  if (def.auth.type !== "token") creds._connected = "true"; // demo / oauth: explicit enable
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
  const creds = await getCreds(userId, id);
  if (!connectedFromCreds(def, creds)) return { ok: false, error: "chưa nhập credential" };
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
  return out;
}

// Run a tool the model asked for. `args` may be an object or a JSON string.
export async function execute(userId: string, toolName: string, args: unknown): Promise<unknown> {
  const id = TOOL_OWNER[toolName];
  const def = id ? BY_ID[id] : undefined;
  if (!def || typeof def.handlers[toolName] !== "function") {
    return { error: "tool không tồn tại: " + toolName };
  }
  const creds = await getCreds(userId, id);
  if (!connectedFromCreds(def, creds)) {
    return { error: 'connector "' + id + '" chưa được kết nối' };
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
