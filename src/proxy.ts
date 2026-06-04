// Next.js 16 renamed the "middleware" file convention to "proxy".
// This runs the edge-safe Auth.js check (authConfig — no DB) on every matched
// request; the `authorized` callback redirects unauthenticated users to /login.
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
