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
// OpenAI-compatible servers cap a function name at 64 characters (Cerebras documents it
// explicitly). De-collision only ever ADDS characters, so it has to stop before the cap
// rather than emit a name the provider will reject.
const MAX_TOOL_NAME = 64;

// One tool name being a strict PREFIX of another is legal, and most providers handle it. One
// measured 2026-08-10 does not: gpt-oss-120b on Cerebras collapses onto the shorter name every
// time. With kg_query and kg_query_datasource both offered it chose kg_query 6/6 — carrying
// kg_query_datasource's arguments, so it knew what it wanted — and 0/6 reached the right tool.
// Renaming the short one to break the prefix took it to 6/6, while tool order,
// parallel_tool_calls and every reasoning_effort level changed nothing. The same held for
// kg_search vs kg_search_chunks (0/5 → 5/5), so it is the prefix relation, not those two tools.
//
// DAAB's names are fine and no server is asked to change: LAAM already invents the name the
// model sees (mcp__<slug>__<tool>) and already translates it back through `route`, so the
// collision is dissolved in the only layer that owns those strings. On the 49-tool DAAB set
// this affects 12 nested pairs, i.e. 11 tools that were otherwise unreachable on that provider.
//
// The suffix is underscores because they are legal everywhere and carry no meaning. One is not
// always enough — "kg_query_" is still a prefix of "kg_query_datasource" (measured: still 0/5)
// — so it grows until the prefix relation is actually broken.
export function deCollideNames(names: readonly string[]): Map<string, string> {
  const all = new Set(names);
  const renamed = new Map<string, string>();
  for (const name of names) {
    const longer = names.filter((n) => n !== name && n.startsWith(name));
    if (longer.length === 0) continue;
    let candidate = name + "_";
    while (longer.some((n) => n.startsWith(candidate)) || all.has(candidate)) candidate += "_";
    if (candidate.length > MAX_TOOL_NAME) {
      console.warn(`[mcp] "${name}" bị lồng tiền tố nhưng tên khử đụng độ vượt ${MAX_TOOL_NAME} ký tự — giữ nguyên`);
      continue;
    }
    renamed.set(name, candidate);
  }
  return renamed;
}

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
    // Per-server: a collision only matters between names the model sees side by side, and the
    // slug already keeps servers apart.
    const nsNames = listing.tools.map((t) => NS + cfg.slug + "__" + t.name);
    const renamed = deCollideNames(nsNames);
    for (const t of listing.tools) {
      const original = NS + cfg.slug + "__" + t.name;
      const name = renamed.get(original) ?? original;
      if (name !== original) {
        console.warn(`[mcp] "${original}" đổi thành "${name}" cho model (tiền tố lồng nhau); tên gốc vẫn gọi được`);
      }
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
      // The ORIGINAL namespaced name stays routable even when it is not advertised. Saved
      // workflows store {server, tool} and rebuild "mcp__<server>__<tool>" at run time
      // (workflow/executors.ts), and past conversations replay the name they recorded — both
      // would break silently against a renamed key. Same for readAllow, or the safety gate
      // would reclassify those calls as writes and start demanding confirmation.
      if (name !== original) {
        route.set(original, { slug: cfg.slug, realName: t.name });
        if (kind === "read") readAllow.add(original);
      }
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
