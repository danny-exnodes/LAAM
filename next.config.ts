import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` is reached cross-origin via Tailscale Serve
  // (https://danny-gaming-pc.tail41dda4.ts.net:8443 → 127.0.0.1:3100). By default
  // Next blocks cross-origin dev-only endpoints (the HMR websocket / refresh
  // runtime); with them blocked the client never finishes bootstrapping, so the
  // page does not hydrate and forms fall back to a native GET submit (login then
  // bounces). Allowing the Tailscale hostname restores HMR + hydration.
  // Dev-only — ignored by `next build` / `next start` (Docker production).
  allowedDevOrigins: ["danny-gaming-pc.tail41dda4.ts.net"],

  // Self-hosted in Docker: emit a self-contained server (.next/standalone/server.js)
  // so the runtime image needs neither the full node_modules nor `next start`.
  // Build-only — ignored by `next dev`.
  output: "standalone",
};

export default nextConfig;
