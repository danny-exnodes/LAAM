import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listServers, addServer, removeServer } from "@/lib/connectors/mcp/store";
import { discoverForUser, invalidateUser } from "@/lib/connectors/mcp/discovery";
import { requireMutator } from "@/lib/auth/rbac";

// Per-user MCP server management for the Connectors page. The token is NEVER echoed
// back to the browser (only `hasToken`). Tool lists come from a best-effort discovery
// (a down/unreachable server simply yields no tools).
//
// GET    /api/connectors/mcp            → { servers: [{ slug, name, url, hasToken, trustReadHints, tools[] }] }
// POST   /api/connectors/mcp            → add { name, url, authToken?, trustReadHints? } → { ok, slug? , error? }
// DELETE /api/connectors/mcp?slug=<s>   → { ok }

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const servers = await listServers(userId);
  const toolsBySlug: Record<string, string[]> = {};
  // P2.3: editor MCP-node form cần schema/kind per tool → toolDetails (additive,
  // `tools` string[] giữ nguyên cho UI hiện có).
  type ToolDetail = { name: string; nsName: string; description: string; parameters: object; kind: "read" | "write" };
  const detailsBySlug: Record<string, ToolDetail[]> = {};
  try {
    const { route, tools } = await discoverForUser(userId);
    for (const [name, r] of route) (toolsBySlug[r.slug] ??= []).push(name);
    for (const t of tools) {
      const r = route.get(t.function.name);
      if (!r) continue;
      (detailsBySlug[r.slug] ??= []).push({
        name: r.realName,
        nsName: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
        kind: t.kind,
      });
    }
  } catch {
    /* discovery best-effort; show servers even if probing fails */
  }

  return NextResponse.json({
    servers: servers.map((s) => ({
      slug: s.slug,
      name: s.name,
      url: s.url,
      hasToken: !!s.authToken,
      trustReadHints: s.trustReadHints,
      tools: toolsBySlug[s.slug] ?? [],
      toolDetails: detailsBySlug[s.slug] ?? [],
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // viewer is read-only — adding an MCP server stores an auth token and arms tool
  // discovery (a write surface). Gate before persisting.
  const gate = requireMutator(session);
  if (gate instanceof Response) return gate;
  const userId = session.user.id;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    url?: string;
    authToken?: string;
    trustReadHints?: boolean;
  };
  if (!body.name?.trim() || !body.url?.trim()) {
    return NextResponse.json({ ok: false, error: "cần tên và URL" }, { status: 400 });
  }
  const result = await addServer(userId, {
    name: body.name.trim(),
    url: body.url.trim(),
    authToken: body.authToken?.trim() || undefined,
    trustReadHints: !!body.trustReadHints,
  });
  if (result.ok) invalidateUser(userId); // new server must be discovered next call
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // viewer is read-only — removing an MCP server mutates the user's server set. Gate first.
  const gate = requireMutator(session);
  if (gate instanceof Response) return gate;
  const userId = session.user.id;

  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ ok: false, error: "thiếu slug" }, { status: 400 });
  const result = await removeServer(userId, slug);
  invalidateUser(userId);
  return NextResponse.json(result);
}
