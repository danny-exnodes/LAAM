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

// Restrict which MCP tools reach the model (MCP_TOOL_ALLOWLIST=nameA,nameB — real tool names,
// not the mcp__slug__ prefixed ones). Unset ⇒ no filtering, i.e. today's behaviour.
//
// Every tool a server advertises is sent on EVERY round. Measured 2026-08-06: one connected
// server contributed 55 tools / 45,678 chars ≈ 11k tokens per round, while the 12-question
// demo set only ever called four of them. Restricting to those four cut the tool schemas from
// ~13.1k to ~2.8k tokens per round.
//
// Set this for TOKEN COST, not for latency. A 3-vs-3 sweep of the 12 questions measured
// 265.6s (all 55) vs 221.6s (4 tools) — a 17% mean improvement that is NOT distinguishable
// from noise (t=0.67, p≈0.54), because this pipeline's run-to-run spread is enormous (the
// same config produced 127.5s and 297.6s on consecutive runs). The ~10.3k tokens saved per
// round are certain; the wall-clock saving is not. Do not quote a speed number from it.
function toolAllowlist(): ReadonlySet<string> | null {
  const raw = (process.env.MCP_TOOL_ALLOWLIST ?? "").trim();
  if (!raw) return null;
  const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return names.length ? new Set(names) : null;
}

export async function discoverForUser(userId: string): Promise<DiscoveryResult> {
  const allowlist = toolAllowlist();
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
      if (allowlist && !allowlist.has(t.name)) continue; // MCP_TOOL_ALLOWLIST
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
