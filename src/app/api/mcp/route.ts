import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { verifyAccessToken } from "@/lib/access-token";
import { handleMcpRequest, type JsonRpcRequest } from "@/lib/mcp-server/handler";
import { mcpToolDefs, getMcpTool } from "@/lib/mcp-server/tools";

// POST /api/mcp — LAAM as an MCP server (feature C). External AI agents call in
// over the Streamable HTTP transport (JSON-RPC). Auth = an access_token of kind
// `api` or `mcp` (NOT a user session, NOT a collector token). Scope: read-only
// laam_* tools. Every tools/call is recorded as a monitored session (source
// `mcp`) so external activity shows up in Monitoring (org-shared, attributed to
// the token's owner). See decisions/machines-decomposition.md (Q3).
export async function POST(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }
  const tok = await verifyAccessToken(token);
  if (!tok || (tok.kind !== "api" && tok.kind !== "mcp")) {
    return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  }
  const userId = tok.userId;

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  const res = await handleMcpRequest(body, {
    serverInfo: { name: "LAAM", version: "2.0.0" },
    listTools: mcpToolDefs,
    async callTool(name, args) {
      const tool = getMcpTool(name);
      if (!tool) return { ok: false, result: { error: `Unknown tool: ${name}` } };
      // Record a monitored session for this external call (Monitoring source=mcp).
      const now = Date.now();
      try {
        await db.insert(agentSessions).values({
          id: `mcp:${crypto.randomUUID()}`,
          source: "mcp",
          userId: userId ?? null,
          machineId: null,
          status: "done",
          latestActivity: `MCP ${name}`,
          startedAt: new Date(now),
          lastActivity: new Date(now),
          toolCount: 1,
        });
      } catch {
        // monitoring is best-effort — never fail the tool call on a record miss
      }
      const result = await tool.handler(args, {
        userId: userId ?? "",
        now,
        lang: "en",
      });
      const okResult = !(result && typeof result === "object" && "error" in result);
      return { ok: okResult, result };
    },
  });

  // Notifications produce no response body.
  if (res === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(res);
}
