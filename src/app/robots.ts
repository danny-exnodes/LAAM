import type { MetadataRoute } from "next";

// Internal tool: only the public landing is crawlable. Everything else is
// auth-gated and would otherwise serve crawlers a 307 → /login (invalid
// robots.txt per Lighthouse).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/monitoring",
          "/agents",
          "/chat",
          "/connectors",
          "/graph",
          "/machines",
          "/workflows",
          "/search",
          "/login",
          "/register",
        ],
      },
    ],
  };
}
