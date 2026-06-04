import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted in Docker: emit a self-contained server (.next/standalone/server.js)
  // so the runtime image needs neither the full node_modules nor `next start`.
  output: "standalone",
};

export default nextConfig;
