// RBAC enforcement for mutation routes. Until this existed `authorized()` only
// checked logged-in (auth.config.ts), so a `viewer` could fire ANY mutation —
// including real connector writes via POST /api/workflows/[id]/run. These guards
// gate MUTATIONS only; read/visibility stays org-shared (Q2, machines-decomposition).
import { NextResponse } from "next/server";
import { roleEnum } from "@/db/schema";

export type Role = (typeof roleEnum.enumValues)[number]; // owner | admin | member | viewer

// Minimal session shape these guards need (the augmented next-auth Session).
type SessionLike = { user?: { id?: string; role?: string } } | null | undefined;

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const forbidden = () =>
  NextResponse.json({ error: "Không đủ quyền" }, { status: 403 });

/** Allow only the listed roles. 401 if no session, 403 if role not in `roles`. */
export function requireRole(
  session: SessionLike,
  roles: Role[],
): { ok: true } | NextResponse {
  if (!session?.user) return unauthorized();
  const role = session.user.role as Role | undefined;
  if (!role || !roles.includes(role)) return forbidden();
  return { ok: true };
}

/** Allow any mutator (owner/admin/member). 401 if no session, 403 for viewer. */
export function requireMutator(session: SessionLike): { ok: true } | NextResponse {
  return requireRole(session, ["owner", "admin", "member"]);
}
