// Per-user connector credential store. The `secret` column holds an
// AES-256-GCM blob (see crypto.ts) — plaintext creds never touch the DB. One
// row per (userId, connectorId); writes upsert.
//
// `dbx` lets callers run a read/write on a specific executor — the advisory-lock
// transaction (oauth/lock.ts) passes its OWN tx so the locked refresh never needs
// a second pool connection (pool-exhaustion deadlock, review 2026-06-12).
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { connectorCredentials } from "@/db/schema";
import { encryptJson, decryptJson } from "./crypto";

// Minimal structural executor type satisfied by both the pool db and a
// drizzle transaction.
export type CredsDb = Pick<typeof db, "select" | "insert" | "delete">;

export async function getCreds(
  userId: string,
  connectorId: string,
  dbx: CredsDb = db,
): Promise<Record<string, string> | null> {
  const rows = await dbx
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
  dbx: CredsDb = db,
): Promise<void> {
  const now = new Date();
  const secret = encryptJson(creds);
  await dbx
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
