import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { accessTokens, auditLog } from "@/db/schema";

// DELETE /api/access-tokens/:id — revoke (soft) a token.
//   • Everyone may revoke their OWN token (self-service — reduces own privilege).
//   • owner/admin may additionally revoke ANY user's token (off-boarding / incident
//     response). For them the WHERE binds only the id, not userId.
// The WHERE is scoped so a member can't revoke another user's key: if it matches
// nothing (wrong owner, already revoked, unknown id) we return 404, not a silent 200.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const actorId = session.user.id as string;
  const role = session.user.role;
  const isPrivileged = role === "owner" || role === "admin";

  const scope = isPrivileged
    ? and(eq(accessTokens.id, id), isNull(accessTokens.revokedAt))
    : and(
        eq(accessTokens.id, id),
        eq(accessTokens.userId, actorId),
        isNull(accessTokens.revokedAt),
      );

  const revoked = await db
    .update(accessTokens)
    .set({ revokedAt: new Date() })
    .where(scope)
    .returning({ id: accessTokens.id, userId: accessTokens.userId });

  if (revoked.length === 0) {
    return NextResponse.json({ error: "Không tìm thấy token" }, { status: 404 });
  }

  // Audit a PRIVILEGED cross-user revoke (off-boarding / incident) — symmetric with
  // token_issued_for so admin actions on other users' credentials leave a trail.
  // Self-revoke stays unlogged (no noise). `subject` is the token's owner read back
  // from the row (code-derived), never a request value.
  const subject = revoked[0].userId;
  if (isPrivileged && subject && subject !== actorId) {
    await db.insert(auditLog).values({
      userId: actorId,
      action: "token_revoked_for",
      target: JSON.stringify({ actor: actorId, subject, tokenId: id }),
    });
  }

  return NextResponse.json({ ok: true });
}
