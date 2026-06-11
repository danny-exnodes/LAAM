import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { accessTokens } from "@/db/schema";

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
  const role = session.user.role;
  const isPrivileged = role === "owner" || role === "admin";

  const scope = isPrivileged
    ? and(eq(accessTokens.id, id), isNull(accessTokens.revokedAt))
    : and(
        eq(accessTokens.id, id),
        eq(accessTokens.userId, session.user.id as string),
        isNull(accessTokens.revokedAt),
      );

  const revoked = await db
    .update(accessTokens)
    .set({ revokedAt: new Date() })
    .where(scope)
    .returning({ id: accessTokens.id });

  if (revoked.length === 0) {
    return NextResponse.json({ error: "Không tìm thấy token" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
