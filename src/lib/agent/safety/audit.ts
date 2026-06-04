// Record each confirmed write into the existing audit_log table (no schema change)
// and use it for replay-dedupe. Pure cores are unit-tested; the thin db wrappers
// follow the project convention (direct db I/O, logic in pure shapers). (Spec §8.4.)
//
// audit_log columns: id, userId, action(text notNull), target(text), createdAt.
// Residual: no unique index → a concurrent double-submit of the same nonce can
// theoretically slip (accepted for the internal POC; durable fix = SP-3 schema).
import { and, eq, gt } from "drizzle-orm";
import { auditLog } from "@/db/schema";
import { redact } from "./redact";

export const WRITE_ACTION = "agent_write";

export type AuditInput = { nonce: string; tool: string; args: Record<string, unknown> };

export function buildAuditRecord(
  userId: string,
  x: AuditInput,
): { userId: string; action: string; target: string } {
  return {
    userId,
    action: WRITE_ACTION,
    target: JSON.stringify({ nonce: x.nonce, tool: x.tool, args: redact(x.args) }),
  };
}

export function nonceUsedInRows(rows: { target: string | null }[], nonce: string): boolean {
  const needle = `"nonce":${JSON.stringify(nonce)}`;
  return rows.some((r) => (r.target ?? "").includes(needle));
}

// --- thin db wrappers (not unit-tested; logic lives in the pure cores above) ---
type DB = typeof import("@/db").db;

export async function recordWrite(db: DB, userId: string, x: AuditInput): Promise<void> {
  await db.insert(auditLog).values(buildAuditRecord(userId, x));
}

export async function isNonceUsed(
  db: DB,
  nonce: string,
  now: number,
  windowMs = 10 * 60_000,
): Promise<boolean> {
  const rows = await db
    .select({ target: auditLog.target })
    .from(auditLog)
    .where(and(eq(auditLog.action, WRITE_ACTION), gt(auditLog.createdAt, new Date(now - windowMs))));
  return nonceUsedInRows(rows, nonce);
}
