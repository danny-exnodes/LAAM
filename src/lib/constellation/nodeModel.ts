import type { CatalogGroup, CatalogTool } from "@/lib/chat/toolCatalog";
import type { ConnectorStatus } from "@/lib/connectors/types";

export type NodeState = "active" | "linked" | "idle";
export type NodeRef =
  | { kind: "agent"; agentId: string }
  | { kind: "tool"; group: CatalogGroup; tool?: CatalogTool }
  | { kind: "connectorIdle"; connectorId: string };
export type ConstNode = { id: string; label: string; ring: "inner" | "outer"; state: NodeState; ref: NodeRef };

export function buildNodes(input: {
  agents: { id: string; name: string }[];
  groups: CatalogGroup[];
  connectors: { id: string; name: string; status: ConnectorStatus }[];
  selectedAgentId?: string;
  focusedGroupId?: string;
}): ConstNode[] {
  const agentNodes: ConstNode[] = input.agents.map((a) => ({
    id: `agent:${a.id}`,
    label: a.name,
    ring: "inner",
    state: a.id === input.selectedAgentId ? "active" : "linked",
    ref: { kind: "agent", agentId: a.id },
  }));

  const groupNodes: ConstNode[] = input.groups.map((g) => ({
    id: `group:${g.id}`,
    label: g.label,
    ring: "outer",
    state: g.id === input.focusedGroupId ? "active" : "linked",
    ref: { kind: "tool", group: g }, // Rule 13: identical source object
  }));

  const idleNodes: ConstNode[] = input.connectors
    .filter((c) => c.status !== "connected")
    .map((c) => ({
      id: `idle:${c.id}`,
      label: c.name,
      ring: "outer",
      state: "idle",
      ref: { kind: "connectorIdle", connectorId: c.id },
    }));

  return [...agentNodes, ...groupNodes, ...idleNodes];
}

export type NodeTint = "gold" | "cyan" | "idle";

/**
 * Visual tint for a node, shared by the HTML node overlay and the canvas beams
 * so a node and its connection line always match. Gold = "live/active": the
 * selected agent + external connector/MCP groups. Cyan = the internal LAAM
 * surface and unselected agents. Idle = disconnected connectors.
 */
export function nodeTint(n: ConstNode): NodeTint {
  if (n.state === "idle") return "idle";
  if (n.state === "active") return "gold";
  if (n.ref.kind === "tool" && n.ref.group.type !== "internal") return "gold";
  return "cyan";
}
