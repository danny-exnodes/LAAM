// Per-user MCP server configs. Reuses the connector credential store: each
// server is one `connector_credential` row with connectorId = "mcp:<slug>" and
// secret = encryptJson({ name, url, authToken, trustReadHints }). Mirrors
// ../store.ts (encrypt + insert/onConflictDoUpdate + delete) so secrets never
// touch the DB in plaintext.
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { connectorCredentials } from "@/db/schema";
import { encryptJson, decryptJson } from "../crypto";
import { assertSafeUrl } from "./ssrf";
import type { McpServerConfig } from "./types";

const PREFIX = "mcp:";

// Stored blob shape (no slug — slug is derived from the connectorId suffix).
type StoredServer = {
  name: string;
  url: string;
  authToken?: string;
  trustReadHints: boolean;
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
      const cfg = decryptJson<StoredServer>(row.secret);
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
    const cfg = decryptJson<StoredServer>(row.secret);
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
  const secret = encryptJson(blob);
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
