// Thin MCP client wrapper. Connects to one remote server (Streamable HTTP, with
// an SSE fallback for older servers), runs a single operation, and ALWAYS closes
// the connection in `finally`. Every call is bounded by a 15s timeout so a hung
// or slow server can never block the chat loop indefinitely.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { assertSafeUrlResolved } from "./ssrf";
import type { McpServerConfig } from "./types";

const TIMEOUT_MS = 15_000;
// Upper bound on tools accepted from one (possibly untrusted) MCP server. A server that returns
// thousands of tools would otherwise bloat the model's tool list / context. Truncation is logged,
// never silent.
const MAX_TOOLS = 200;

export type RemoteTool = {
  name: string;
  description?: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

type TextBlock = { type: "text"; text: string };
type CallToolResult = { content: unknown[] };

function authInit(cfg: McpServerConfig): { requestInit?: { headers: Record<string, string> } } {
  return cfg.authToken
    ? { requestInit: { headers: { Authorization: `Bearer ${cfg.authToken}` } } }
    : {};
}

// Connect with Streamable HTTP; on any failure retry once over SSE. Returns the
// connected client (caller owns closing it).
async function connect(cfg: McpServerConfig): Promise<Client> {
  // SSRF: resolve + validate the URL BEFORE opening any transport, so a hostname pointing at a
  // private / metadata IP is rejected at the actual fetch chokepoint (not only at config time).
  await assertSafeUrlResolved(cfg.url);
  const client = new Client({ name: "laam", version: "2.0" });
  try {
    const transport = new StreamableHTTPClientTransport(new URL(cfg.url), authInit(cfg));
    await client.connect(transport);
  } catch {
    const transport = new SSEClientTransport(new URL(cfg.url), authInit(cfg));
    await client.connect(transport);
  }
  return client;
}

// Reject if `p` doesn't settle within TIMEOUT_MS. The underlying client is closed
// by the caller's finally regardless of which side wins.
function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`MCP timeout sau ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export async function listTools(cfg: McpServerConfig): Promise<RemoteTool[]> {
  const client = await connect(cfg);
  try {
    const res = (await withTimeout(client.listTools())) as { tools: RemoteTool[] };
    const all = res.tools ?? [];
    if (all.length > MAX_TOOLS) {
      console.warn(`[mcp] server '${cfg.slug}' trả ${all.length} tool — cắt còn ${MAX_TOOLS} (DoS guard)`);
      return all.slice(0, MAX_TOOLS);
    }
    return all;
  } finally {
    await client.close();
  }
}

export async function callTool(
  cfg: McpServerConfig,
  realName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const client = await connect(cfg);
  try {
    const res = (await withTimeout(
      client.callTool({ name: realName, arguments: args }),
    )) as CallToolResult;
    const blocks = Array.isArray(res?.content) ? res.content : [];
    // If every block is text, flatten to a single string for the model. Otherwise
    // hand back the raw content array (images / resources / etc.).
    const allText =
      blocks.length > 0 &&
      blocks.every((b) => (b as { type?: string })?.type === "text");
    if (allText) {
      return { text: (blocks as TextBlock[]).map((b) => b.text).join("\n") };
    }
    return { content: res.content };
  } finally {
    await client.close();
  }
}
