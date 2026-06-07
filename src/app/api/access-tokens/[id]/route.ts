import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { accessTokens } from "@/db/schema";

// DELETE /api/access-tokens/:id — revoke (soft) one of the CALLER's own tokens.
// Ownership-scoped: the WHERE binds userId so a user can't revoke another's key.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await db
    .update(accessTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(accessTokens.id, id),
        eq(accessTokens.userId, session.user.id as string),
        isNull(accessTokens.revokedAt),
      ),
    );
  return NextResponse.json({ ok: true });
}
