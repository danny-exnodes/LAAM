// Edge-safe Auth.js config (NO database / bcrypt imports) so it can run in
// middleware. The real Credentials provider + Drizzle adapter live in auth.ts.
import type { NextAuthConfig } from "next-auth";

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
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
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
