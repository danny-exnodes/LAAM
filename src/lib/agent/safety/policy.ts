// Classify a tool call as read or write so the gate knows whether to require
// confirmation. Internal tools self-declare via Tool.kind; connector tools
// self-declare via ConnectorTool.kind — and policy DERIVES the connector map from
// the registry (single source of truth: adding a tool touches one connector file,
// never this allowlist). Unknown tools FAIL CLOSED (treated as write/gated) + warn:
// a new write can never be silently ungated; worst case a new read is gated until
// it declares kind. (Spec §3.3.)
import type { Tool } from "../types";
import { CONNECTORS } from "@/lib/connectors/registry";

// name → kind, derived from each connector's self-declared ConnectorTool.kind.
const CONNECTOR_KIND: ReadonlyMap<string, "read" | "write"> = new Map(
  CONNECTORS.flatMap((c) => c.tools.map((t) => [t.function.name, t.kind] as const)),
);

export function resolveKind(
  name: string,
  internal: Tool[],
  readAllow?: ReadonlySet<string>,
): "read" | "write" {
  const tool = internal.find((t) => t.name === name);
  if (tool) return tool.kind;
  const k = CONNECTOR_KIND.get(name);
  if (k) return k;
  // MCP tools are NOT in the static registry → fail-closed to write, UNLESS the user
  // opted into trusting this server's read hints (readAllow is computed per-user from
  // each MCP server's trustReadHints × the tool's readOnlyHint annotation).
  if (readAllow?.has(name)) return "read";
  console.warn(`[safety] tool chưa phân loại, mặc định GATE (write): ${name}`);
  return "write";
}

// G2 blast-radius tier (orthogonal to read/write). v1 workflow runs may only
// perform LOW-blast actions; everything else is HIGH and fail-closed in the
// workflow connector path (manual AND scheduled). The allowlist is code-defined
// (NOT user-editable) and fail-closed: anything not listed is HIGH. Reads are
// gated separately by resolveKind — only WRITEs are blast-classified at the call
// site. (spec scheduler "blast-radius gate, v1 BLAST_LOW-only".)
export const BLAST_LOW: ReadonlySet<string> = new Set([
  "demo_create_task", // credential-free demo write, low impact
]);

export function resolveBlast(name: string): "low" | "high" {
  return BLAST_LOW.has(name) ? "low" : "high";
}
