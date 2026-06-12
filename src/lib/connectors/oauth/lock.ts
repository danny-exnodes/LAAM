// Cross-process credential lock for single-use rotating refresh tokens
// (Atlassian, Zalo): dev (:3100/:8443) and prod share ONE Postgres, so an
// in-process mutex cannot stop two Node processes from refreshing the same
// credential concurrently — the loser's stored refresh_token would be rotated
// away and the connection bricked (spec 2026-06-12 §12.2).
//
// pg_advisory_xact_lock blocks until granted and releases automatically at
// transaction end. `fn` receives THIS transaction and MUST run its creds
// reads/writes on it (store.ts accepts the executor): the lock holder is then
// self-sufficient on its single pool connection, so a burst of concurrent
// refreshes can only queue temporarily (waiters pin a client each, the holder
// always completes) instead of deadlocking the whole app (review 2026-06-12 —
// the previous shape ran fn's queries on the GLOBAL pool while this transaction
// pinned a client: 10 in-flight refreshes = circular wait, permanent wedge).
//
// Callers MUST re-read creds inside `fn` (double-checked locking: the previous
// holder may have already refreshed — or DELETED the row; a null re-read is
// authoritative, never resurrect the captured creds).
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { CredsDb } from "../store";

export async function withCredLock<T>(
  userId: string,
  connectorId: string,
  fn: (tx: CredsDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // hashtext: stable Postgres int4 hash of the credential identity (a hash
    // collision only over-serializes two unrelated creds — never contaminates).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId + ":" + connectorId}))`);
    return fn(tx);
  });
}
