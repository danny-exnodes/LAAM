# V2 Wave 4 — Package W4-F (Connector Framework) Implementation Plan

> **For agentic workers:** Sub-plan of `2026-06-03-v2-wave4-connectors.md`. TDD, bite-sized steps. Owner: agent `framework`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement the connector framework backend — AES-256-GCM credential encryption (`crypto.ts`), per-user Postgres-backed credential store (`store.ts`), and the user-scoped framework functions (`index.ts`) replacing the stubs — porting v1 `lib/connectors/index.js` logic to the locked v2 signatures.

**Architecture:** `crypto.ts` round-trips JSON through AES-256-GCM with a key derived (sha256) from `process.env.CONNECTOR_KEY ?? process.env.AUTH_SECRET ?? dev-fallback`, packing `iv:authTag:ciphertext` as base64 segments. `store.ts` does Drizzle upsert/select/delete on `connectorCredentials`, with the `secret` column = `encryptJson(creds)`. `index.ts` composes the registry (`CONNECTORS`) + store into the locked `list/isConnected/connect/disconnect/testConnector/chatTools/execute` API.

**Tech Stack:** `node:crypto`, Drizzle (`@/db`), vitest. No new deps.

---

## Files

- Create: `v2/src/lib/connectors/crypto.ts` — `encryptJson` / `decryptJson` + key derivation.
- Create: `v2/src/lib/connectors/crypto.test.ts`
- Create: `v2/src/lib/connectors/store.ts` — `getCreds` / `setCreds` / `delCreds` (Drizzle).
- Create: `v2/src/lib/connectors/store.test.ts`
- Modify: `v2/src/lib/connectors/index.ts` — implement the 7 locked stub bodies.
- Create: `v2/src/lib/connectors/index.test.ts`

Locked contracts: `v2/src/lib/connectors/types.ts`. Registry (filled by another agent): `registry.ts`. DB client + schema: `@/db`, `connectorCredentials` table.

HARD CONSTRAINTS: do NOT edit types.ts / registry.ts / connector modules / api routes / components / package.json / vitest. Run only my own tests. Do NOT commit.

---

## Task 1: crypto.ts — AES-256-GCM round-trip + tamper detection

**Files:**
- Create: `v2/src/lib/connectors/crypto.ts`
- Test: `v2/src/lib/connectors/crypto.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { encryptJson, decryptJson } from "./crypto";

describe("connector crypto", () => {
  test("round-trips an object", () => {
    const obj = { token: "ghp_secret123", _connectedAt: "2026-06-03T00:00:00Z" };
    const blob = encryptJson(obj);
    expect(typeof blob).toBe("string");
    expect(blob).not.toContain("ghp_secret123"); // ciphertext, not plaintext
    expect(decryptJson(blob)).toEqual(obj);
  });

  test("produces a different blob each call (random IV)", () => {
    const obj = { a: "1" };
    expect(encryptJson(obj)).not.toBe(encryptJson(obj));
  });

  test("rejects a tampered blob (auth tag mismatch)", () => {
    const blob = encryptJson({ a: "1" });
    const parts = blob.split(":");
    // flip a byte in the ciphertext segment
    const ct = Buffer.from(parts[2], "base64");
    ct[0] ^= 0xff;
    parts[2] = ct.toString("base64");
    expect(() => decryptJson(parts.join(":"))).toThrow();
  });

  test("rejects a malformed blob", () => {
    expect(() => decryptJson("not-a-blob")).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `cd v2 && npx vitest run src/lib/connectors/crypto`
Expected: FAIL — `encryptJson is not a function` / module not found.

- [ ] **Step 3: Implement crypto.ts**

```ts
// AES-256-GCM credential encryption for connector secrets.
// The encrypted blob is "iv:authTag:ciphertext" (each base64). The 32-byte key
// is derived (sha256) from CONNECTOR_KEY (preferred), else AUTH_SECRET, else a
// documented dev-only fallback — production MUST set one of those env vars.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const DEV_FALLBACK = "laam-connector-dev-key-do-not-use-in-prod";

function key(): Buffer {
  const src = process.env.CONNECTOR_KEY ?? process.env.AUTH_SECRET ?? DEV_FALLBACK;
  // sha256 -> exactly 32 bytes, regardless of source length.
  return createHash("sha256").update(src, "utf8").digest();
}

export function encryptJson(obj: unknown): string {
  const iv = randomBytes(12); // 96-bit nonce, recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptJson<T = Record<string, string>>(blob: string): T {
  const parts = String(blob).split(":");
  if (parts.length !== 3) throw new Error("invalid connector secret blob");
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `cd v2 && npx vitest run src/lib/connectors/crypto`
Expected: PASS (4 tests).

---

## Task 2: store.ts — Drizzle credential CRUD (encrypted)

**Files:**
- Create: `v2/src/lib/connectors/store.ts`
- Test: `v2/src/lib/connectors/store.test.ts`

Convention (from `src/app/api/chat/route.test.ts`): mock `@/db` and `@/db/schema` via `vi.mock`. `getCreds` decrypts; `setCreds` encrypts + upserts on `(userId, connectorId)`; `delCreds` deletes the row.

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

const rows: { value: Record<string, unknown> } = { value: {} as Record<string, unknown> };

// Chainable Drizzle stubs. select->from->where returns an array.
const selectWhere = vi.fn(async () => rows.queryResult);
const insertOnConflict = vi.fn(async () => undefined);
const deleteWhere = vi.fn(async () => undefined);

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: insertOnConflict }) }),
    delete: () => ({ where: deleteWhere }),
  },
}));
vi.mock("@/db/schema", () => ({
  connectorCredentials: { userId: "userId", connectorId: "connectorId" },
}));

import { getCreds, setCreds, delCreds } from "./store";
import { encryptJson } from "./crypto";

beforeEach(() => {
  selectWhere.mockClear();
  insertOnConflict.mockClear();
  deleteWhere.mockClear();
});

describe("connector store", () => {
  test("getCreds returns null when no row", async () => {
    rows.queryResult = [];
    expect(await getCreds("u1", "github")).toBeNull();
  });

  test("getCreds decrypts the stored secret blob", async () => {
    rows.queryResult = [{ secret: encryptJson({ token: "ghp_x" }) }];
    expect(await getCreds("u1", "github")).toEqual({ token: "ghp_x" });
  });

  test("setCreds upserts an encrypted blob", async () => {
    await setCreds("u1", "github", { token: "ghp_x" });
    expect(insertOnConflict).toHaveBeenCalledTimes(1);
  });

  test("delCreds deletes the row", async () => {
    await delCreds("u1", "github");
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `cd v2 && npx vitest run src/lib/connectors/store`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement store.ts**

```ts
// Per-user connector credential store. The `secret` column holds an
// AES-256-GCM blob (see crypto.ts) — plaintext creds never touch the DB. One
// row per (userId, connectorId); writes upsert.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { connectorCredentials } from "@/db/schema";
import { encryptJson, decryptJson } from "./crypto";

export async function getCreds(
  userId: string,
  connectorId: string,
): Promise<Record<string, string> | null> {
  const rows = await db
    .select()
    .from(connectorCredentials)
    .where(
      and(
        eq(connectorCredentials.userId, userId),
        eq(connectorCredentials.connectorId, connectorId),
      ),
    );
  const row = rows[0];
  if (!row) return null;
  try {
    return decryptJson<Record<string, string>>(row.secret);
  } catch {
    return null; // unreadable blob (key rotated / corrupt) → treat as not set
  }
}

export async function setCreds(
  userId: string,
  connectorId: string,
  creds: Record<string, string>,
): Promise<void> {
  const now = new Date();
  const secret = encryptJson(creds);
  await db
    .insert(connectorCredentials)
    .values({ userId, connectorId, secret, updatedAt: now })
    .onConflictDoUpdate({
      target: [connectorCredentials.userId, connectorCredentials.connectorId],
      set: { secret, updatedAt: now },
    });
}

export async function delCreds(userId: string, connectorId: string): Promise<void> {
  await db
    .delete(connectorCredentials)
    .where(
      and(
        eq(connectorCredentials.userId, userId),
        eq(connectorCredentials.connectorId, connectorId),
      ),
    );
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `cd v2 && npx vitest run src/lib/connectors/store`
Expected: PASS (4 tests).

---

## Task 3: index.ts — implement the locked framework functions

**Files:**
- Modify: `v2/src/lib/connectors/index.ts` (replace stub bodies, keep signatures)
- Test: `v2/src/lib/connectors/index.test.ts`

Port v1 `lib/connectors/index.js` logic. Differences from v1: registry is `CONNECTORS` (array, not fs-scan); credentials come from `store.ts` (async, per-user) not a JSON file. Mask rule: keep last 4 (`••••` + last4) for secret fields, raw value for non-secret fields. `isConnected`: token → all required fields set; demo/oauth → `_connected` flag. Strings stay Vietnamese (parity).

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Connector } from "./types";

// In-memory creds keyed by `${userId}:${id}`.
const memCreds: Record<string, Record<string, string> | null> = {};
const getCreds = vi.fn(async (u: string, id: string) => memCreds[`${u}:${id}`] ?? null);
const setCreds = vi.fn(async (u: string, id: string, c: Record<string, string>) => {
  memCreds[`${u}:${id}`] = c;
});
const delCreds = vi.fn(async (u: string, id: string) => {
  memCreds[`${u}:${id}`] = null;
});
vi.mock("./store", () => ({ getCreds, setCreds, delCreds }));

// Fake registry: a token connector + a demo (no-auth) connector.
const github: Connector = {
  id: "github",
  name: "GitHub",
  icon: "github",
  blurb: "Repos",
  auth: { type: "token", help: "h", setup: "", fields: [{ key: "token", label: "Token", secret: true }] },
  tools: [{ type: "function", function: { name: "github_list_repos", description: "d", parameters: {} } }],
  handlers: { github_list_repos: vi.fn(async () => ({ repos: ["a"] })) },
  test: vi.fn(async () => ({ ok: true, info: "ok" })),
};
const demo: Connector = {
  id: "demo",
  name: "Demo",
  icon: "play",
  blurb: "Demo",
  auth: { type: "none" },
  tools: [{ type: "function", function: { name: "demo_list_tasks", description: "d", parameters: {} } }],
  handlers: { demo_list_tasks: vi.fn(async () => ({ tasks: [] })) },
};
vi.mock("./registry", () => ({ CONNECTORS: [github, demo] }));

import { list, isConnected, connect, disconnect, testConnector, chatTools, execute } from "./index";

beforeEach(() => {
  for (const k of Object.keys(memCreds)) delete memCreds[k];
  getCreds.mockClear();
  setCreds.mockClear();
  delCreds.mockClear();
  (github.handlers.github_list_repos as ReturnType<typeof vi.fn>).mockClear();
});

describe("isConnected", () => {
  test("token connector: false when field missing, true when set", async () => {
    expect(await isConnected("u1", "github")).toBe(false);
    memCreds["u1:github"] = { token: "ghp_x" };
    expect(await isConnected("u1", "github")).toBe(true);
  });
  test("no-auth/demo connector: connected only via _connected flag", async () => {
    expect(await isConnected("u1", "demo")).toBe(false);
    memCreds["u1:demo"] = { _connected: "true" };
    expect(await isConnected("u1", "demo")).toBe(true);
  });
  test("unknown connector → false", async () => {
    expect(await isConnected("u1", "nope")).toBe(false);
  });
});

describe("list", () => {
  test("masks secret fields (keep last 4), reports connected + tools", async () => {
    memCreds["u1:github"] = { token: "ghp_secretXYZ9", _connectedAt: "2026-06-03T00:00:00Z" };
    const items = await list("u1");
    const gh = items.find((i) => i.id === "github")!;
    expect(gh.connected).toBe(true);
    expect(gh.tools).toEqual(["github_list_repos"]);
    expect(gh.connectedAt).toBe("2026-06-03T00:00:00Z");
    const f = gh.auth.fields[0];
    expect(f.set).toBe(true);
    expect(f.masked).toBe("••••XYZ9"); // last 4
    expect(f.masked).not.toContain("ghp_secret");
  });
  test("scopes to the given user (no creds → not connected, empty mask)", async () => {
    const items = await list("u2");
    const gh = items.find((i) => i.id === "github")!;
    expect(gh.connected).toBe(false);
    expect(gh.auth.fields[0].set).toBe(false);
    expect(gh.auth.fields[0].masked).toBe("");
  });
});

describe("connect / disconnect", () => {
  test("connect stores trimmed token fields", async () => {
    const r = await connect("u1", "github", { token: "  ghp_x  " });
    expect(r.ok).toBe(true);
    expect(memCreds["u1:github"]!.token).toBe("ghp_x");
    expect(memCreds["u1:github"]!._connectedAt).toBeTruthy();
  });
  test("connect a no-auth connector sets _connected flag", async () => {
    await connect("u1", "demo", {});
    expect(memCreds["u1:demo"]!._connected).toBe("true");
  });
  test("connect unknown connector → error", async () => {
    const r = await connect("u1", "nope", {});
    expect(r.ok).toBe(false);
  });
  test("disconnect removes creds", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    const r = await disconnect("u1", "github");
    expect(r.ok).toBe(true);
    expect(delCreds).toHaveBeenCalledWith("u1", "github");
  });
});

describe("testConnector", () => {
  test("not connected → error", async () => {
    const r = await testConnector("u1", "github");
    expect(r.ok).toBe(false);
  });
  test("connected → runs connector.test with decrypted creds", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    const r = await testConnector("u1", "github");
    expect(r.ok).toBe(true);
    expect(r.info).toBe("ok");
    expect(github.test).toHaveBeenCalledWith({ token: "ghp_x" });
  });
  test("connector without test() → ok with note", async () => {
    memCreds["u1:demo"] = { _connected: "true" };
    const r = await testConnector("u1", "demo");
    expect(r.ok).toBe(true);
  });
});

describe("chatTools", () => {
  test("returns tools of only the user's connected connectors", async () => {
    expect(await chatTools("u1")).toEqual([]);
    memCreds["u1:github"] = { token: "ghp_x" };
    const tools = await chatTools("u1");
    expect(tools.map((t) => t.function.name)).toEqual(["github_list_repos"]);
  });
});

describe("execute", () => {
  test("unknown tool → error object", async () => {
    const r = (await execute("u1", "nope_tool", {})) as { error?: string };
    expect(r.error).toBeTruthy();
  });
  test("tool of a not-connected connector → error", async () => {
    const r = (await execute("u1", "github_list_repos", {})) as { error?: string };
    expect(r.error).toBeTruthy();
  });
  test("runs the handler with parsed args + decrypted creds", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    const r = await execute("u1", "github_list_repos", '{"q":"x"}');
    expect(r).toEqual({ repos: ["a"] });
    expect(github.handlers.github_list_repos).toHaveBeenCalledWith({ q: "x" }, { token: "ghp_x" });
  });
  test("handler throw → error object (does not throw)", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    (github.handlers.github_list_repos as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const r = (await execute("u1", "github_list_repos", {})) as { error?: string };
    expect(r.error).toContain("boom");
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `cd v2 && npx vitest run src/lib/connectors/index`
Expected: FAIL — stubs throw `connector framework not implemented yet`.

- [ ] **Step 3: Implement index.ts** (replace stub bodies; keep signatures + header comment intent)

```ts
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
  if (def.auth.type === "token") return (def.auth.fields ?? []).every((f) => creds[f.key]);
  return creds._connected === "true"; // demo / oauth: explicit enable
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
  if (def.auth.type !== "token") creds._connected = "true"; // demo / oauth
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

export async function chatTools(userId: string): Promise<ConnectorTool[]> {
  const out: ConnectorTool[] = [];
  for (const def of CONNECTORS) {
    if (await isConnected(userId, def.id)) out.push(...def.tools);
  }
  return out;
}

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
```

- [ ] **Step 4: Run to verify PASS**

Run: `cd v2 && npx vitest run src/lib/connectors/index`
Expected: PASS (all describe blocks).

---

## Task 4: Full package verification

- [ ] **Step 1: Run all three suites**

Run: `cd v2 && npx vitest run src/lib/connectors/crypto src/lib/connectors/store src/lib/connectors/index`
Expected: all green.

- [ ] **Step 2: typecheck the new files only**

Run: `cd v2 && npx tsc --noEmit` (if fast) OR rely on vitest's esbuild + report any type issues to TL.

- [ ] **Step 3: Checkpoint + SendMessage to team-lead** with files, pasted vitest summary, and the encryption-key-source deviation note. Do NOT commit.

## Notes / deviations to surface
- **Encryption key source:** `CONNECTOR_KEY ?? AUTH_SECRET ?? dev-fallback`. `.env.example` already defines `AUTH_SECRET`; no `CONNECTOR_KEY` exists. Using sha256(src)→32 bytes (not scrypt) for determinism + simplicity; documented dev fallback means creds written in dev with the fallback become unreadable once a real key is set (acceptable — surfaced to TL).
- `_connected` is stored as the string `"true"` (creds are `Record<string,string>`), so the flag check compares to `"true"`.
- v1 had `loadConnectors()` (fs-scan) + `hasAnyConnected()`; v2 drops both — registry is static and not in the locked signatures.
