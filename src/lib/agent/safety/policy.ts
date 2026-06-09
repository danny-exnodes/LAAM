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

// Workflow-readiness gate (orthogonal to read/write). A connector WRITE may run inside a
// workflow run ONLY if its tool self-declares workflowSafe:true. Derived from the CONNECTORS
// registry (single source of truth, same idiom as kind) and FAIL-CLOSED: anything not declared
// is treated as not-safe. Reads are gated separately by resolveKind — only WRITEs are
// readiness-classified at the call site. (spec 2026-06-08 §3.)
const WORKFLOW_SAFE: ReadonlySet<string> = new Set(
  CONNECTORS.flatMap((c) => c.tools.filter((t) => t.workflowSafe).map((t) => t.function.name)),
);

export function isWorkflowSafe(name: string): boolean {
  return WORKFLOW_SAFE.has(name);
}
