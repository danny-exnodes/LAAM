// Cross-process credential lock for single-use rotating refresh tokens
// (Atlassian, Zalo): dev (:3100/:8443) and prod share ONE Postgres, so an
// in-process mutex cannot stop two Node processes from refreshing the same
// credential concurrently — the loser's stored refresh_token would be rotated
// away and the connection bricked (spec 2026-06-12 §12.2).
//
// pg_advisory_xact_lock blocks until granted and releases automatically at
// transaction end — callers MUST re-read creds inside `fn` (double-checked
// locking: the previous holder may have already refreshed).
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function withCredLock<T>(
  userId: string,
  connectorId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // hashtext: stable Postgres int4 hash of the credential identity.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId + ":" + connectorId}))`);
    return fn();
  });
}
