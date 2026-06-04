import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { name, email, password } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length) {
    return NextResponse.json({ error: "Email đã tồn tại" }, { status: 409 });
  }

  // First account becomes the owner; everyone else defaults to "member".
  const countRows = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  const isFirst = (countRows[0]?.n ?? 0) === 0;

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    name,
    email,
    passwordHash,
    role: isFirst ? "owner" : "member",
  });

  return NextResponse.json({ ok: true });
}
