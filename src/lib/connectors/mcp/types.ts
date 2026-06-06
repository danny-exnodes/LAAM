// MCP connector — shared types. LAAM acts as an MCP *client*: each user
// configures remote MCP servers (HTTP), and their tools are surfaced into chat.
//
// McpServerConfig is the decrypted shape of one stored server (see store.ts;
// persisted as a `connector_credential` row with connectorId = "mcp:<slug>").
// McpDiscoveredTool is the namespaced, read/write-classified projection of a
// remote tool (see discovery.ts).

export type McpServerConfig = {
  slug: string;
  name: string;
  url: string;
  authToken?: string;
  trustReadHints: boolean;
};

export type McpDiscoveredTool = {
  name: string;
  description: string;
  parameters: object;
  kind: "read" | "write";
  slug: string;
  realName: string;
};
