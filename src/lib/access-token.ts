// Access tokens — unified credential for non-interactive callers (collector,
// API, MCP). Generalizes machine-token.ts. The raw token is shown to the issuer
// ONCE; only its sha256 hash is stored. sha256 (not bcrypt) is correct here: the
// token is high-entropy random, not a user-chosen password.
//
// `userId` on the row = provenance/revoke/audit, NOT a data-isolation key.
// See decisions/machines-decomposition.md (Q2): ingest stays org-shared.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accessTokens, users, type AccessToken } from "@/db/schema";
import { generateMachineToken, hashToken } from "@/lib/machine-token";

// Re-export the shared primitives so callers have one import surface and we
// never fork the hashing algorithm.
export { hashToken };

export type AccessTokenKind = "collector" | "api" | "mcp";

/** Generate a new raw token (shown once). Same shape as the machine token. */
export function generateAccessToken(): string {
  return generateMachineToken();
}

/**
 * Split a raw token into non-secret display fields. `prefix` is enough to tell
 * keys apart in a list without revealing the secret; `last4` is the tail.
 */
export function formatTokenDisplay(token: string): { prefix: string; last4: string } {
  return { prefix: token.slice(0, 9), last4: token.slice(-4) };
}

/**
 * Resolve a raw token to its access_token row, or null if it is unknown,
 * revoked, expired, or (when `kind` is given) of the wrong kind. On a hit,
 * stamps `lastUsedAt`. tokenHash is UNIQUE, so at most one row matches.
 */
export async function verifyAccessToken(
  token: string,
  opts?: { kind?: AccessTokenKind },
): Promise<AccessToken | null> {
  const rows = await db
    .select()
    .from(accessTokens)
    .where(eq(accessTokens.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0] as AccessToken | undefined;
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  if (opts?.kind && row.kind !== opts.kind) return null;

  // Defense-in-depth (off-boarding): a disabled user's credential is invalid even if
  // the token row was never flipped to revoked. Disabling normally revokes all tokens
  // in one tx, but this re-check makes `disabled` authoritative regardless of token
  // state — the correct invariant now that owner/admins can mint tokens FOR a user.
  // (collector tokens may have a null userId — provenance only — so skip when absent.)
  if (row.userId) {
    const [owner] = await db
      .select({ disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    if (owner?.disabledAt) return null;
  }

  await db
    .update(accessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(accessTokens.id, row.id));
  return row;
}

/**
 * Set of machineIds that currently have a non-revoked collector token. Lets the
 * machines list show "token active" now that the credential lives in
 * access_token rather than machines.tokenHash.
 */
export async function machinesWithActiveToken(): Promise<Set<string>> {
  const rows = await db
    .select({ machineId: accessTokens.machineId })
    .from(accessTokens)
    .where(and(eq(accessTokens.kind, "collector"), isNull(accessTokens.revokedAt)));
  const out = new Set<string>();
  for (const r of rows) if (r.machineId) out.add(r.machineId);
  return out;
}
