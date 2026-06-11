// Edge-safe Auth.js config (NO database / bcrypt imports) so it can run in
// middleware. The real Credentials provider + Drizzle adapter live in auth.ts.
//
// IMPORTANT: refreshSessionFromDb IS a DB import and cannot run on the Edge
// runtime. auth.config.ts is used by both middleware (Edge) and the Node
// handler in auth.ts. The jwt callback that calls refreshSessionFromDb only
// executes in the Node handler (token-refresh path on API/page requests), NOT
// in the Edge middleware (middleware only calls `authorized`). Next.js does not
// invoke the jwt callback from middleware — it reads the already-decoded token.
// So including a Node-only import here is safe as long as the middleware never
// imports anything that triggers jwt callback execution.
import type { NextAuthConfig } from "next-auth";
import { refreshSessionFromDb } from "@/lib/auth/session-refresh";

export const authConfig = {
  // Self-hosted (not Vercel) → trust the Host header. Required so Auth.js works
  // under `next start`, behind Tailscale, or any reverse proxy without throwing
  // UntrustedHost. (Equivalent to env AUTH_TRUST_HOST=true.)
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [], // added in auth.ts (Node runtime)
  callbacks: {
    // Route protection for middleware: everything requires login except the
    // auth pages and the Auth.js API.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const p = nextUrl.pathname;
      const isPublic =
        p === "/" || // public marketing landing page (shown to everyone)
        p === "/robots.txt" || // metadata route must be reachable by crawlers
        p === "/login" ||
        p === "/register" ||
        p === "/api/register" || // signup endpoint must be reachable when logged out
        p === "/api/ingest" || // collector authenticates with a machine token, not a session
        p === "/api/mcp" || // MCP server: external agents authenticate with an access_token, not a session
        p === "/api/workflows/tick" || // scheduler poke: localhost/secret auth, not a session
        p.startsWith("/api/auth");
      if (isPublic) return true;
      return isLoggedIn;
    },
    async jwt({ token, user }) {
      // Sign-in path: `user` is present only on the initial sign-in/sign-up.
      // Set role from the authorised user object and return — no extra DB read.
      if (user) {
        token.role = (user as { role?: string }).role;
        return token;
      }

      // Token-refresh path: subsequent requests where only `token` is available.
      // Re-read user from DB to enforce disable/role changes without re-login.
      // Guard: skip if there is no sub (anonymous / malformed token).
      if (!token.sub) return token;

      const result = await refreshSessionFromDb(token.sub);

      // User disabled or deleted — returning null invalidates the JWT cookie.
      // Auth.js v5 / @auth/core supports `jwt()` returning null to force sign-out
      // (see @auth/core/index.d.ts: `jwt?: ... => Awaitable<JWT | null>`).
      if (!result.valid) return null;

      // Refresh role in-token so a promote/demote takes effect immediately
      // without requiring the user to re-login. On DB error, result.role is
      // undefined and we keep the existing token role (fail-open policy).
      if (result.role !== undefined) {
        token.role = result.role;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        if (token.role) session.user.role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
