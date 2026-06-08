// MCP server tool surface (feature C). LAAM exposes its READ-ONLY laam_* tools
// to external agents. Scope v1 (CTO verdict Q3): read-only laam_* ONLY — no
// connector writes (external = outside our trust boundary). The tools are the
// already-guarded INTERNAL_TOOLS (validate + bound), so external callers go
// through the same safety as chat.
import { INTERNAL_TOOLS } from "@/lib/agent/registry";
import type { Tool } from "@/lib/agent/types";

/** MCP tool definition shape (tools/list). */
export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: object;
};

/** Read-only laam_* tools, guarded. Map by name for tools/call dispatch. */
export const MCP_TOOLS: Tool[] = INTERNAL_TOOLS.filter(
  (t) => t.name.startsWith("laam_") && t.kind === "read",
);

const BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t]));

export function mcpToolDefs(): McpToolDef[] {
  return MCP_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.parameters,
  }));
}

export function getMcpTool(name: string): Tool | undefined {
  return BY_NAME.get(name);
}
