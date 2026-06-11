// Full Auth.js (Node runtime): Drizzle adapter + Credentials (email/password).
// Session strategy is JWT because the Credentials provider can't use DB sessions.
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { createLoginLockout } from "@/lib/auth/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Brute-force lockout (in-memory, single-process — Docker 1 container):
// ≥5 failures within 10 minutes locks the email for 15 minutes. While locked,
// authorize() returns null — indistinguishable from a wrong password, so an
// attacker cannot probe the lock state.
const lockout = createLoginLockout({
  maxFails: 5,
  failWindowMs: 10 * 60 * 1000,
  lockMs: 15 * 60 * 1000,
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        if (lockout.isLocked(email)) return null;

        const rows = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        const user = rows[0];
        if (!user?.passwordHash) {
          // Unknown emails count too, so lockout behaviour can't reveal which emails exist.
          lockout.recordFailure(email);
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          lockout.recordFailure(email);
          return null;
        }
        lockout.recordSuccess(email);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});
