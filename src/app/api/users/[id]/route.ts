import { NextResponse } from "next/server";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, accessTokens, machines, auditLog, roleEnum } from "@/db/schema";
import { requireRole } from "@/lib/auth/rbac";

// PATCH /api/users/:id — user-management mutations. Two disjoint operations:
//   { role }     → OWNER-ONLY. Change a user's role. Guards: can't change your
//                  own role, can't demote the last owner.
//   { disabled } → owner/admin. Off-boarding: disabling sets user.disabledAt AND
//                  revokes ALL the user's access_tokens + clears legacy
//                  machines.tokenHash (the ingest fallback path) in one tx, so a
//                  departed user can no longer ingest, call MCP, or log in.
//                  Enabling clears disabledAt but does NOT restore tokens.
//
// audit_log.target stores a JSON string (the table column is plain text).
const schema = z
  .object({
    role: z.enum(roleEnum.enumValues).optional(),
    disabled: z.boolean().optional(),
  })
  .refine((b) => b.role !== undefined || b.disabled !== undefined, {
    message: "role or disabled required",
  });

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

/** Count owners that are NOT the given user and still active (not disabled). */
async function otherOwnerCount(excludeId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "owner"), ne(users.id, excludeId), isNull(users.disabledAt)))
    .limit(1);
  return Number(row?.n ?? 0);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  // disabled toggle is owner/admin; role change is owner-only (checked below).
  const gate = requireRole(session, ["owner", "admin"]);
  if (gate instanceof Response) return gate;
  const actorId = session!.user.id as string;

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Tham số không hợp lệ");

  const [target] = await db
    .select({ id: users.id, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

  // ---- role change (owner-only) -----------------------------------------
  if (parsed.data.role !== undefined) {
    if (session!.user.role !== "owner") {
      return NextResponse.json({ error: "Chỉ owner đổi được vai trò" }, { status: 403 });
    }
    const newRole = parsed.data.role;
    if (id === actorId) return badRequest("Không thể đổi vai trò của chính bạn");

    const oldRole = target.role as string;
    if (oldRole === "owner" && newRole !== "owner") {
      // Demoting an owner: must leave at least one other (active) owner standing.
      if ((await otherOwnerCount(id)) === 0) {
        return badRequest("Không thể giáng cấp owner cuối cùng");
      }
    }

    if (newRole !== oldRole) {
      await db.transaction(async (tx) => {
        await tx.update(users).set({ role: newRole }).where(eq(users.id, id));
        await tx.insert(auditLog).values({
          userId: actorId,
          action: "role_change",
          target: JSON.stringify({ actor: actorId, subject: id, from: oldRole, to: newRole }),
        });
      });
    }
    return NextResponse.json({ ok: true, id, role: newRole });
  }

  // ---- disabled toggle (owner/admin) ------------------------------------
  const disabled = parsed.data.disabled as boolean;
  if (disabled) {
    if (id === actorId) return badRequest("Không thể vô hiệu hoá chính bạn");
    if (target.role === "owner" && (await otherOwnerCount(id)) === 0) {
      return badRequest("Không thể vô hiệu hoá owner cuối cùng");
    }
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ disabledAt: now }).where(eq(users.id, id));
      // Revoke every non-revoked access_token the user owns (api/mcp/collector).
      await tx
        .update(accessTokens)
        .set({ revokedAt: now })
        .where(and(eq(accessTokens.userId, id), isNull(accessTokens.revokedAt)));
      // Clear the legacy ingest fallback (machines.tokenHash) for machines they own.
      await tx
        .update(machines)
        .set({ tokenHash: null })
        .where(eq(machines.ownerUserId, id));
      await tx.insert(auditLog).values({
        userId: actorId,
        action: "user_disabled",
        target: JSON.stringify({ actor: actorId, subject: id }),
      });
    });
    return NextResponse.json({ ok: true, id, disabled: true });
  }

  // Enabling: clear disabledAt. Tokens are NOT auto-restored — the user re-creates.
  await db.transaction(async (tx) => {
    await tx.update(users).set({ disabledAt: null }).where(eq(users.id, id));
    await tx.insert(auditLog).values({
      userId: actorId,
      action: "user_enabled",
      target: JSON.stringify({ actor: actorId, subject: id }),
    });
  });
  return NextResponse.json({ ok: true, id, disabled: false });
}
