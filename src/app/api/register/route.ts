import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIpFrom, createFixedWindowLimiter } from "@/lib/auth/rate-limit";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  inviteCode: z.string().max(200).optional(),
});

// In-memory, assumes single-process deployment (Docker, 1 container).
const limiter = createFixedWindowLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

export async function POST(req: Request) {
  if (!limiter.consume(clientIpFrom(req.headers))) {
    return NextResponse.json({ error: "Quá nhiều yêu cầu, thử lại sau" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { name, email, password, inviteCode } = parsed.data;

  // REGISTER_MODE gate. Runs BEFORE the email lookup so rejected requests
  // (wrong/missing invite, closed mode) reveal nothing about existing emails.
  const mode = process.env.REGISTER_MODE || "open";
  if (mode === "invite") {
    const expected = process.env.REGISTER_INVITE_CODE;
    // Unset/empty REGISTER_INVITE_CODE fails closed: every registration is rejected.
    if (!expected || inviteCode !== expected) {
      return NextResponse.json({ error: "Mã mời không hợp lệ" }, { status: 403 });
    }
  } else if (mode !== "open") {
    // "closed" — and any unrecognized value, so a typo'd env var fails closed.
    // Only the first-owner bootstrap on an empty users table is allowed.
    const countRows = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    if ((countRows[0]?.n ?? 0) > 0) {
      return NextResponse.json({ error: "Đăng ký đang đóng" }, { status: 403 });
    }
  }

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

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({
    name,
    email,
    passwordHash,
    role: isFirst ? "owner" : "member",
  });

  return NextResponse.json({ ok: true });
}
