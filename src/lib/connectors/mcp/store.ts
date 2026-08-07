// Per-user MCP server configs. Reuses the connector credential store: each
// server is one `connector_credential` row with connectorId = "mcp:<slug>" and
// secret = encryptJsonForUser(userId, { name, url, authToken, trustReadHints }). Mirrors
// ../store.ts (per-user encrypt + insert/onConflictDoUpdate + delete) so secrets — including the
// server's authToken — never touch the DB in plaintext and are isolated per user.
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { connectorCredentials } from "@/db/schema";
import { encryptJsonForUser, decryptJsonForUser } from "../crypto";
import { assertSafeUrl } from "./ssrf";
import type { McpServerConfig } from "./types";

const PREFIX = "mcp:";

// Stored blob shape (no slug — slug is derived from the connectorId suffix).
type StoredServer = {
  name: string;
  url: string;
  authToken?: string;
  trustReadHints: boolean;
  enabledTools?: string[];
};

function slugify(name: string): string {
  return String(name ?? "")
    .normalize("NFKD") // split accented letters into base + combining mark
    .replace(/\p{Diacritic}/gu, "") // fold é→e, à→a … (else they'd become '-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function listServers(userId: string): Promise<McpServerConfig[]> {
  const rows = await db
    .select()
    .from(connectorCredentials)
    .where(
      and(
        eq(connectorCredentials.userId, userId),
        like(connectorCredentials.connectorId, `${PREFIX}%`),
      ),
    );
  const out: McpServerConfig[] = [];
  for (const row of rows) {
    try {
      const cfg = decryptJsonForUser<StoredServer>(userId, row.secret);
      out.push({ slug: row.connectorId.slice(PREFIX.length), ...cfg });
    } catch {
      // unreadable blob (key rotated / corrupt) → skip this server
    }
  }
  return out;
}

export async function getServer(userId: string, slug: string): Promise<McpServerConfig | null> {
  const rows = await db
    .select()
    .from(connectorCredentials)
    .where(
      and(
        eq(connectorCredentials.userId, userId),
        eq(connectorCredentials.connectorId, PREFIX + slug),
      ),
    );
  const row = rows[0];
  if (!row) return null;
  try {
    const cfg = decryptJsonForUser<StoredServer>(userId, row.secret);
    return { slug, ...cfg };
  } catch {
    return null;
  }
}

export async function addServer(
  userId: string,
  input: { name: string; url: string; authToken?: string; trustReadHints?: boolean },
): Promise<{ ok: boolean; slug?: string; error?: string }> {
  try {
    assertSafeUrl(input.url);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const base = slugify(input.name) || "server";
  // Ensure uniqueness vs existing servers by suffixing -2, -3, …
  const existing = new Set((await listServers(userId)).map((s) => s.slug));
  let slug = base;
  for (let n = 2; existing.has(slug); n++) slug = `${base}-${n}`;

  const blob: StoredServer = {
    name: input.name,
    url: input.url,
    authToken: input.authToken,
    trustReadHints: input.trustReadHints ?? false,
  };
  const now = new Date();
  const secret = encryptJsonForUser(userId, blob);
  try {
    await db
      .insert(connectorCredentials)
      .values({ userId, connectorId: PREFIX + slug, secret, updatedAt: now })
      .onConflictDoUpdate({
        target: [connectorCredentials.userId, connectorCredentials.connectorId],
        set: { secret, updatedAt: now },
      });
  } catch {
    return { ok: false, error: "không lưu được MCP server" };
  }
  return { ok: true, slug };
}

// Persist which tools of one server may reach the chat model. `null` clears the choice
// (back to "all tools"). Read-modify-write because the whole config lives in one encrypted
// blob — a blind write would drop the url/token alongside it.
export async function setEnabledTools(
  userId: string,
  slug: string,
  enabledTools: string[] | null,
): Promise<{ ok: boolean; error?: string }> {
  const current = await getServer(userId, slug);
  if (!current) return { ok: false, error: "không tìm thấy MCP server" };

  const blob: StoredServer = {
    name: current.name,
    url: current.url,
    authToken: current.authToken,
    trustReadHints: current.trustReadHints,
    ...(enabledTools ? { enabledTools } : {}),
  };
  const now = new Date();
  try {
    await db
      .update(connectorCredentials)
      .set({ secret: encryptJsonForUser(userId, blob), updatedAt: now })
      .where(
        and(
          eq(connectorCredentials.userId, userId),
          eq(connectorCredentials.connectorId, PREFIX + slug),
        ),
      );
  } catch {
    return { ok: false, error: "không lưu được danh sách tool" };
  }
  return { ok: true };
}

// Change a server's label or endpoint in place, keeping everything else — token, trust flag and
// tool selection.
//
// The SLUG is deliberately not derived again. It is the row key, it is embedded in every tool
// name the model sees (mcp__<slug>__<tool>), and deployments reference those names in config
// (TOOL_DATA_FETCH, TOOL_DRILLDOWN_PAIRS). Recomputing it from a new label would silently
// detach those guards, so renaming changes what people read and nothing that code matches on.
export async function updateServer(
  userId: string,
  slug: string,
  patch: { name?: string; url?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (patch.url !== undefined) {
    try {
      assertSafeUrl(patch.url);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  const current = await getServer(userId, slug);
  if (!current) return { ok: false, error: "không tìm thấy MCP server" };

  const blob: StoredServer = {
    name: patch.name?.trim() || current.name,
    url: patch.url?.trim() || current.url,
    authToken: current.authToken,
    trustReadHints: current.trustReadHints,
    ...(current.enabledTools ? { enabledTools: current.enabledTools } : {}),
  };
  try {
    await db
      .update(connectorCredentials)
      .set({ secret: encryptJsonForUser(userId, blob), updatedAt: new Date() })
      .where(
        and(
          eq(connectorCredentials.userId, userId),
          eq(connectorCredentials.connectorId, PREFIX + slug),
        ),
      );
  } catch {
    return { ok: false, error: "không lưu được thay đổi" };
  }
  return { ok: true };
}

export async function removeServer(userId: string, slug: string): Promise<{ ok: boolean }> {
  await db
    .delete(connectorCredentials)
    .where(
      and(
        eq(connectorCredentials.userId, userId),
        eq(connectorCredentials.connectorId, PREFIX + slug),
      ),
    );
  return { ok: true };
}
