// LAAM connector framework.
// ===========================================================================
// A connector exposes a set of TOOLS that the chat model can call. When the
// model emits a tool_call, the chat loop runs the matching handler with the
// user's stored credentials and feeds the real result back to the model.
//
// Each connector is one file in this directory exporting a default object:
//   export default {
//     id: 'github',
//     name: 'GitHub',
//     icon: 'github-ish-lucide-name',
//     blurb: 'Repos, issues, PRs',
//     auth: { type: 'token', fields: [{ key, label, placeholder, secret }],
//             help: '…how to get the token…' },         // or { type:'oauth', setup:'…' }
//     tools: [ { type:'function', function:{ name, description, parameters } } ],
//     handlers: { '<tool name>': async (args, creds) => <json-serialisable result> },
//     test: async (creds) => ({ ok: bool, info: string }),   // optional
//   }
// Drop a new file here and it auto-registers — no edits to this file.
//
// Credentials the user enters are stored server-side ONLY, in
// $LAAM_CONFIG_DIR/connectors.json (default ~/.laam), file mode 600, and are
// NEVER returned to the browser in clear (always masked) or logged.
// ===========================================================================
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = process.env.LAAM_CONFIG_DIR || path.join(os.homedir(), '.laam');
const STORE = path.join(CONFIG_DIR, 'connectors.json');

const REGISTRY = Object.create(null); // id -> connector definition
const TOOL_OWNER = Object.create(null); // tool name -> connector id

// ---- credential store ----------------------------------------------------
function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')) || {}; } catch { return {}; }
}
function writeStore(data) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(data, null, 2), { mode: 0o600 });
    try { fs.chmodSync(STORE, 0o600); } catch {}
    return true;
  } catch (e) { return false; }
}

// Mask a secret value for display: keep last 4 chars.
function maskValue(v) {
  const s = String(v == null ? '' : v);
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-4);
}

// ---- load connector modules (any *.js in this dir except index.js) --------
export async function loadConnectors() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js'); } catch {}
  for (const f of files) {
    try {
      const mod = await import('./' + f);
      const def = mod && mod.default;
      if (!def || !def.id) continue;
      REGISTRY[def.id] = def;
      for (const t of def.tools || []) {
        const name = t && t.function && t.function.name;
        if (name) TOOL_OWNER[name] = def.id;
      }
    } catch (e) { console.error('[connectors] failed to load', f, e.message); }
  }
  return Object.keys(REGISTRY);
}

// ---- introspection (safe for the browser) --------------------------------
export function isConnected(id) {
  const def = REGISTRY[id];
  if (!def) return false;
  const creds = readStore()[id];
  if (!creds) return false;
  // token connectors: every required field present.
  if (def.auth && def.auth.type === 'token') {
    return (def.auth.fields || []).every((fl) => creds[fl.key]);
  }
  // no-auth (demo) / oauth: connected only when explicitly enabled.
  return !!creds._connected;
}

export function list() {
  const store = readStore();
  return Object.values(REGISTRY).map((def) => {
    const creds = store[def.id] || {};
    const connected = isConnected(def.id);
    const fields = (def.auth && def.auth.fields) || [];
    return {
      id: def.id,
      name: def.name,
      icon: def.icon || 'plug',
      blurb: def.blurb || '',
      auth: {
        type: (def.auth && def.auth.type) || 'token',
        setup: (def.auth && def.auth.setup) || '',
        help: (def.auth && def.auth.help) || '',
        fields: fields.map((fl) => ({
          key: fl.key, label: fl.label, placeholder: fl.placeholder || '', secret: !!fl.secret,
          // never send the raw value back — only a masked hint when present
          set: !!creds[fl.key], masked: creds[fl.key] ? (fl.secret ? maskValue(creds[fl.key]) : creds[fl.key]) : '',
        })),
      },
      tools: (def.tools || []).map((t) => t.function && t.function.name).filter(Boolean),
      connected,
      connectedAt: creds._connectedAt || null,
    };
  });
}

// ---- mutate credentials ---------------------------------------------------
export function connect(id, fields) {
  const def = REGISTRY[id];
  if (!def) return { ok: false, error: 'unknown connector' };
  const store = readStore();
  const creds = store[id] || {};
  for (const fl of (def.auth && def.auth.fields) || []) {
    if (fields && typeof fields[fl.key] === 'string' && fields[fl.key].trim()) creds[fl.key] = fields[fl.key].trim();
  }
  if (def.auth && def.auth.type !== 'token') creds._connected = true; // demo / oauth: explicit enable
  creds._connectedAt = new Date().toISOString();
  store[id] = creds;
  if (!writeStore(store)) return { ok: false, error: 'không lưu được credential' };
  return { ok: true };
}

export function disconnect(id) {
  const store = readStore();
  if (store[id]) { delete store[id]; writeStore(store); }
  return { ok: true };
}

export async function testConnector(id) {
  const def = REGISTRY[id];
  if (!def) return { ok: false, error: 'unknown connector' };
  if (!isConnected(id)) return { ok: false, error: 'chưa nhập credential' };
  if (typeof def.test !== 'function') return { ok: true, info: 'đã lưu credential (connector này không có kiểm tra)' };
  try {
    const r = await def.test(readStore()[id] || {});
    return r && r.ok ? { ok: true, info: r.info || 'kết nối OK' } : { ok: false, error: (r && r.error) || 'kiểm tra thất bại' };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ---- chat integration -----------------------------------------------------
// Tools of every CONNECTED connector, to pass to the model.
export function chatTools() {
  const out = [];
  for (const def of Object.values(REGISTRY)) {
    if (isConnected(def.id)) for (const t of def.tools || []) out.push(t);
  }
  return out;
}

// Run a tool the model asked for. `args` may be an object or a JSON string.
export async function execute(toolName, args) {
  const id = TOOL_OWNER[toolName];
  const def = id && REGISTRY[id];
  if (!def || !def.handlers || typeof def.handlers[toolName] !== 'function') {
    return { error: 'tool không tồn tại: ' + toolName };
  }
  if (!isConnected(id)) return { error: 'connector "' + id + '" chưa được kết nối' };
  let a = args;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
  try {
    const result = await def.handlers[toolName](a || {}, readStore()[id] || {});
    return result;
  } catch (e) {
    return { error: 'lỗi khi gọi ' + toolName + ': ' + (e && e.message ? e.message : String(e)) };
  }
}

export function hasAnyConnected() { return Object.keys(REGISTRY).some((id) => isConnected(id)); }
