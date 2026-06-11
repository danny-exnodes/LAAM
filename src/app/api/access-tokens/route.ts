import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { accessTokens } from "@/db/schema";
import { generateAccessToken, formatTokenDisplay, hashToken } from "@/lib/access-token";
import { requireMutator } from "@/lib/auth/rbac";

// Personal API / MCP access tokens. Per-user: a user manages their OWN tokens
// (the credential a programmatic client or external MCP agent presents). Collector
// tokens are issued separately via /api/machines. UI (/settings/access) deferred —
// this is the backend surface (see decisions/machines-decomposition.md).

// GET /api/access-tokens — list the caller's api/mcp tokens (masked, no hash).
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select({
      id: accessTokens.id,
      kind: accessTokens.kind,
      name: accessTokens.name,
      prefix: accessTokens.prefix,
      last4: accessTokens.last4,
      lastUsedAt: accessTokens.lastUsedAt,
      revokedAt: accessTokens.revokedAt,
      createdAt: accessTokens.createdAt,
    })
    .from(accessTokens)
    .where(eq(accessTokens.userId, session.user.id as string))
    .orderBy(desc(accessTokens.createdAt));
  // collector tokens are managed under /machines — only surface api/mcp here.
  return NextResponse.json({ tokens: rows.filter((r) => r.kind === "api" || r.kind === "mcp") });
}

// POST /api/access-tokens — issue a new api|mcp token for the caller. Raw token
// returned ONCE. Scope is read-only for now (Q3); write exposure is a later phase.
const createSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["api", "mcp"]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gate = requireMutator(session); // viewer is read-only — cannot mint tokens
  if (gate instanceof Response) return gate;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Tham số không hợp lệ" }, { status: 400 });
  }

  const token = generateAccessToken();
  const { prefix, last4 } = formatTokenDisplay(token);
  const [row] = await db
    .insert(accessTokens)
    .values({
      kind: parsed.data.kind,
      userId: session.user.id as string,
      name: parsed.data.name,
      prefix,
      last4,
      tokenHash: hashToken(token),
      scopes: ["read"], // read-only surface for now (Q3)
    })
    .returning({ id: accessTokens.id });

  return NextResponse.json({ ok: true, id: row.id, kind: parsed.data.kind, token, prefix, last4 });
}
