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

// Upper bound on the instructions text accepted from ONE server. This text goes
// into the system prompt, so a server returning a novel would both blow the
// context budget and drown the operator's own prompt — cap it, and never silently
// (the marker stays visible to the model).
const MAX_INSTRUCTIONS_CHARS = 2_000;

export type DiscoveryResult = {
  tools: ConnectorTool[];
  // Namespaced names of the tools the user left ON for chat. Discovery still returns EVERY
  // tool in `tools` — the connectors page has to list the disabled ones so they can be turned
  // back on, and the workflow editor offers all of them. Only chatTools() filters by this.
  enabled: Set<string>;
  readAllow: Set<string>;
  route: Map<string, { slug: string; realName: string }>;
  // Per-server `instructions` from initialize, for servers that actually contribute an
  // enabled tool this turn — a server whose tools are all OFF must not keep steering the
  // model. Labelled by slug at compose time so the model can tell whose claim it is.
  instructions: { slug: string; text: string }[];
};

type CacheEntry = { at: number; result: DiscoveryResult };
const cache = new Map<string, CacheEntry>();

export async function discoverForUser(userId: string): Promise<DiscoveryResult> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;

  const tools: ConnectorTool[] = [];
  const enabled = new Set<string>();
  const readAllow = new Set<string>();
  const route = new Map<string, { slug: string; realName: string }>();

  const instructions: { slug: string; text: string }[] = [];

  const servers = await listServers(userId);
  for (const cfg of servers) {
    let listing;
    try {
      listing = await listTools(cfg);
    } catch (e) {
      // A down / misconfigured server must never break discovery for the others.
      console.error(`[mcp] listTools failed for "${cfg.slug}":`, e instanceof Error ? e.message : e);
      continue;
    }
    // undefined ⇒ every tool (default). An EMPTY array is a deliberate "none", so it must be
    // honoured rather than treated as unset.
    const allow = cfg.enabledTools ? new Set(cfg.enabledTools) : null;
    let contributed = false;
    for (const t of listing.tools) {
      const name = NS + cfg.slug + "__" + t.name;
      if (!allow || allow.has(t.name)) {
        enabled.add(name);
        contributed = true;
      }
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
    const text = listing.instructions?.trim();
    if (contributed && text) {
      instructions.push({
        slug: cfg.slug,
        text:
          text.length > MAX_INSTRUCTIONS_CHARS
            ? text.slice(0, MAX_INSTRUCTIONS_CHARS) + " […đã cắt bớt]"
            : text,
      });
    }
  }

  const result: DiscoveryResult = { tools, enabled, readAllow, route, instructions };
  cache.set(userId, { at: Date.now(), result });
  return result;
}

export function invalidateUser(userId: string): void {
  cache.delete(userId);
}
