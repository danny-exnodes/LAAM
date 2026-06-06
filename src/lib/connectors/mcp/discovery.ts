// MCP tool discovery: turn a user's configured MCP servers into ConnectorTools
// the chat model can call, plus the routing + read-allow metadata the safety
// layer needs. Results are cached per-user (~30s TTL) since listing every
// server's tools on each chat turn is expensive; invalidateUser clears the entry
// after a server is added/removed.
//
// Two security-critical rules live here:
//   1. Namespacing — remote tool "foo" becomes "mcp__<slug>__foo" so two servers
//      can't collide and a server can't shadow a built-in connector tool.
//   2. Fail-closed kind — a tool is "read" ONLY when the server config opts in
//      (trustReadHints) AND the tool explicitly sets readOnlyHint === true.
//      Everything else (no hint, destructiveHint, trust off) is "write", so it
//      goes through the write-confirmation gate.
import type { ConnectorTool } from "../types";
import { listServers } from "./store";
import { listTools } from "./client";

const NS = "mcp__";
const TTL_MS = 30_000;

export type DiscoveryResult = {
  tools: ConnectorTool[];
  readAllow: Set<string>;
  route: Map<string, { slug: string; realName: string }>;
};

type CacheEntry = { at: number; result: DiscoveryResult };
const cache = new Map<string, CacheEntry>();

export async function discoverForUser(userId: string): Promise<DiscoveryResult> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;

  const tools: ConnectorTool[] = [];
  const readAllow = new Set<string>();
  const route = new Map<string, { slug: string; realName: string }>();

  const servers = await listServers(userId);
  for (const cfg of servers) {
    let remoteTools;
    try {
      remoteTools = await listTools(cfg);
    } catch (e) {
      // A down / misconfigured server must never break discovery for the others.
      console.error(`[mcp] listTools failed for "${cfg.slug}":`, e instanceof Error ? e.message : e);
      continue;
    }
    for (const t of remoteTools) {
      const name = NS + cfg.slug + "__" + t.name;
      // FAIL-CLOSED: read only when trusted AND explicitly hinted read-only.
      const kind: "read" | "write" =
        cfg.trustReadHints && t.annotations?.readOnlyHint === true ? "read" : "write";
      tools.push({
        type: "function",
        kind,
        function: {
          name,
          description: t.description || "",
          parameters: t.inputSchema || { type: "object", properties: {} },
        },
      });
      if (kind === "read") readAllow.add(name);
      route.set(name, { slug: cfg.slug, realName: t.name });
    }
  }

  const result: DiscoveryResult = { tools, readAllow, route };
  cache.set(userId, { at: Date.now(), result });
  return result;
}

export function invalidateUser(userId: string): void {
  cache.delete(userId);
}
