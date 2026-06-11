import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth/rbac";

// GET /api/users — user-management list (owner/admin only). Projects an explicit
// SAFE column set: passwordHash and any future secret column can NEVER leak here.
export async function GET() {
  const session = await auth();
  const gate = requireRole(session, ["owner", "admin"]);
  if (gate instanceof Response) return gate;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      disabledAt: users.disabledAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));

  return NextResponse.json({ users: rows });
}
