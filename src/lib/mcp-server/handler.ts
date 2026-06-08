// Minimal MCP JSON-RPC 2.0 dispatch over HTTP (Streamable HTTP core). Pure: the
// route injects `deps` (real tool list + tool runner). Supports the subset an
// external agent needs: initialize, tools/list, tools/call, ping. Notifications
// (no id) produce no response. Unknown methods → JSON-RPC -32601.
import type { McpToolDef } from "./tools";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

export type McpDeps = {
  listTools: () => McpToolDef[];
  /** Run a tool by name; ok=false surfaces as an MCP tool error (not a protocol error). */
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ ok: boolean; result: unknown }>;
  serverInfo: { name: string; version: string };
};

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function err(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Handle one JSON-RPC request. Returns null for notifications (caller replies
 * 202/no body). `id` is echoed; a missing id is treated as a notification.
 */
export async function handleMcpRequest(
  req: JsonRpcRequest,
  deps: McpDeps,
): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  const method = req.method ?? "";
  const isNotification = req.id === undefined || method.startsWith("notifications/");
  if (isNotification) return null;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: deps.serverInfo,
      });

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: deps.listTools() });

    case "tools/call": {
      const name = req.params?.name;
      if (typeof name !== "string") return err(id, -32602, "Invalid params: name required");
      const argsRaw = req.params?.arguments;
      const args =
        argsRaw && typeof argsRaw === "object" && !Array.isArray(argsRaw)
          ? (argsRaw as Record<string, unknown>)
          : {};
      const { ok: toolOk, result } = await deps.callTool(name, args);
      // MCP convention: tool errors are a normal result with isError, not a
      // protocol error — so the agent can read what went wrong.
      return ok(id, {
        content: [{ type: "text", text: JSON.stringify(result) }],
        isError: !toolOk,
      });
    }

    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}
