// Per-request JWT re-validation helper.
//
// Called on every authenticated request (token-refresh path, i.e. no `user`
// argument in the jwt callback). Does ONE indexed PK lookup per request.
// Acceptable for <50 users — revisit if user count grows large.
//
// Fail-open on DB error: a transient Postgres blip must NOT log everyone out.
// The session stays alive with its existing role; the disable takes effect once
// the DB recovers (typically next request). Logged at console.error.
//
// Exported standalone so it is unit-testable without full Auth.js plumbing.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export type SessionRefreshResult =
  | { valid: true; role: string | undefined }
  | { valid: false };

/**
 * Re-read user state from DB to validate an existing JWT token.
 *
 * @param userId - token.sub (Auth.js user id)
 * @returns { valid: true, role } for active users;
 *          { valid: false } for disabled / deleted users;
 *          { valid: true, role: undefined } when the DB read fails (fail-open).
 */
export async function refreshSessionFromDb(
  userId: string,
): Promise<SessionRefreshResult> {
  try {
    const rows = await db
      .select({ role: users.role, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = rows[0];

    // User deleted from DB — invalidate.
    if (!user) return { valid: false };

    // User soft-disabled (off-boarding) — invalidate.
    if (user.disabledAt) return { valid: false };

    // Active user — return current role so token stays fresh.
    return { valid: true, role: user.role };
  } catch (err) {
    // Fail-open: keep the existing session alive; caller keeps old role.
    // Rationale: a transient DB blip should NOT lock out the whole team.
    // The disable check applies again on the next request once DB recovers.
    console.error("[session-refresh] DB read failed — keeping existing token:", err);
    return { valid: true, role: undefined };
  }
}
