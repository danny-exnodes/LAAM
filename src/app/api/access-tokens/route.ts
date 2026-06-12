import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { accessTokens, users, auditLog } from "@/db/schema";
import { generateAccessToken, formatTokenDisplay, hashToken } from "@/lib/access-token";
import { requireMutator, requireRole } from "@/lib/auth/rbac";

// Personal API / MCP access tokens. A user manages their OWN tokens (the credential
// a programmatic client or external MCP agent presents); collector tokens are issued
// separately via /api/machines. An owner/admin may also PROVISION a token for another
// user (see POST) — surfaced in the /settings/users keys expander.

// The mint response carries the plaintext token (shown once) — never cache it.
const NO_STORE = { "Cache-Control": "no-store" } as const;

// GET /api/access-tokens — list api/mcp tokens (masked, no hash).
//   • default: the caller's own tokens.
//   • owner/admin may pass ?userId=<id> to view ANOTHER user's tokens (keys expander).
// Role is checked FIRST: a member's ?userId is structurally ignored, so a
// non-privileged caller can only ever read their own tokens.
export async function GET(req?: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role;
  const isPrivileged = role === "owner" || role === "admin";
  const param = req ? new URL(req.url).searchParams.get("userId") : null;
  // Role-first: the query param can only widen the scope for a privileged caller.
  const targetUserId = isPrivileged && param ? param : (session.user.id as string);

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
      // who provisioned it (null = self-service). The UI maps this id to a name;
      // tokenHash is deliberately NOT projected — the secret never leaves the DB.
      createdByUserId: accessTokens.createdByUserId,
    })
    .from(accessTokens)
    .where(eq(accessTokens.userId, targetUserId))
    .orderBy(desc(accessTokens.createdAt));
  // collector tokens are managed under /machines — only surface api/mcp here.
  return NextResponse.json({ tokens: rows.filter((r) => r.kind === "api" || r.kind === "mcp") });
}

// POST /api/access-tokens — issue a new api|mcp token. Raw token returned ONCE.
//   • self-service (no forUserId, or forUserId == caller): any mutator (viewer 403).
//   • provisioning (forUserId != caller): OWNER/ADMIN only — mint a token attributed
//     to another user. The token reads org-shared monitoring read-only AS that user;
//     every provisioning is audited (token_issued_for). An admin may NOT provision
//     for an owner/admin target — only an owner may (attribution-laundering guard).
//
// The schema is pinned to {name, kind, forUserId}: userId/createdByUserId/scopes are
// ALWAYS server-derived below, never read from the body (over-posting defense).
const createSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["api", "mcp"]),
  forUserId: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Tham số không hợp lệ" }, { status: 400 });
  }
  const actorId = session.user.id as string;
  const { name, kind, forUserId } = parsed.data;
  const provisioning = forUserId !== undefined && forUserId !== actorId;

  if (!provisioning) {
    const gate = requireMutator(session); // viewer is read-only — cannot mint tokens
    if (gate instanceof Response) return gate;
    return mintSelf(actorId, name, kind);
  }

  // --- provisioning for another user (owner/admin only) -------------------
  const gate = requireRole(session, ["owner", "admin"]);
  if (gate instanceof Response) return gate;

  // Validate the target from the DB — the inserted userId is this code-derived id,
  // never the (possibly altered) value echoed in the request body (Rule 13).
  const [target] = await db
    .select({ id: users.id, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, forUserId as string))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
  }
  if (target.disabledAt) {
    // A disabled user just had every credential revoked — never mint a fresh one.
    return NextResponse.json({ error: "Người dùng đã bị vô hiệu hoá" }, { status: 400 });
  }
  const targetPrivileged = target.role === "owner" || target.role === "admin";
  if (targetPrivileged && session.user.role !== "owner") {
    return NextResponse.json(
      { error: "Chỉ owner mới cấp được khoá cho owner/admin" },
      { status: 403 },
    );
  }

  // Code-forced, self-documenting name so the SUBJECT (who sees it in their own
  // /settings/access) can tell this key was provisioned for them, not self-minted.
  // Derived from the session, not echoed from any untrusted field (Rule 13).
  const actorName = session.user.name ?? "admin";
  const provisionedName = `${name} (provisioned by ${actorName})`;

  const token = generateAccessToken();
  const { prefix, last4 } = formatTokenDisplay(token);
  const tokenHash = hashToken(token);

  // One transaction: the token row and its audit row commit together — a provisioned
  // credential never persists without its trail.
  const tokenId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(accessTokens)
      .values({
        kind,
        userId: target.id, // the validated target id, NOT the request-body value
        createdByUserId: actorId,
        name: provisionedName,
        prefix,
        last4,
        tokenHash,
        scopes: ["read"],
      })
      .returning({ id: accessTokens.id });
    await tx.insert(auditLog).values({
      userId: actorId,
      action: "token_issued_for",
      // tokenId, NOT the token value — the secret is never written to the audit log.
      target: JSON.stringify({ actor: actorId, subject: target.id, tokenId: row.id, kind }),
    });
    return row.id;
  });

  return NextResponse.json(
    { ok: true, id: tokenId, kind, token, prefix, last4, forUserId: target.id },
    { headers: NO_STORE },
  );
}

// Self-service mint (caller mints for themselves). Returns the raw token once.
async function mintSelf(userId: string, name: string, kind: "api" | "mcp") {
  const token = generateAccessToken();
  const { prefix, last4 } = formatTokenDisplay(token);
  const [row] = await db
    .insert(accessTokens)
    .values({
      kind,
      userId,
      createdByUserId: null, // self-service
      name,
      prefix,
      last4,
      tokenHash: hashToken(token),
      scopes: ["read"], // read-only surface for now (Q3)
    })
    .returning({ id: accessTokens.id });
  return NextResponse.json(
    { ok: true, id: row.id, kind, token, prefix, last4 },
    { headers: NO_STORE },
  );
}
