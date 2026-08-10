import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listServers, addServer, removeServer, setEnabledTools, updateServer } from "@/lib/connectors/mcp/store";
import { discoverForUser, invalidateUser } from "@/lib/connectors/mcp/discovery";
import { requireMutator } from "@/lib/auth/rbac";

// Per-user MCP server management for the Connectors page. The token is NEVER echoed
// back to the browser (only `hasToken`). Tool lists come from a best-effort discovery
// (a down/unreachable server simply yields no tools).
//
// GET    /api/connectors/mcp            → { servers: [{ slug, name, url, hasToken, trustReadHints, tools[] }] }
// POST   /api/connectors/mcp            → add { name, url, authToken?, trustReadHints? } → { ok, slug? , error? }
// PATCH  /api/connectors/mcp            → { slug, enabledTools?, url?, name? } → { ok }
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
  // Real (un-namespaced) names of the tools currently switched ON, so the page can render a
  // checkbox per tool. Absent `enabledTools` on the server config ⇒ everything is on.
  const enabledBySlug: Record<string, string[]> = {};
  try {
    const { route, tools, enabled } = await discoverForUser(userId);
    // A result without `enabled` means every tool is on (same default as the config).
    for (const [name, r] of route) if (!enabled || enabled.has(name)) (enabledBySlug[r.slug] ??= []).push(r.realName);
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
      enabledTools: enabledBySlug[s.slug] ?? [],
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

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Changing which tools the model may call changes what the assistant can DO — a mutation,
  // gated like adding/removing a server rather than treated as a display preference.
  const gate = requireMutator(session);
  if (gate instanceof Response) return gate;
  const userId = session.user.id;

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string;
    enabledTools?: unknown;
    url?: string;
    name?: string;
  };
  if (!body.slug?.trim()) return NextResponse.json({ ok: false, error: "thiếu slug" }, { status: 400 });

  // Label / endpoint edit. Repointing a connector (e.g. adding a per-connection option to the
  // query string) or renaming it must not cost the tool selection, which remove-and-re-add
  // would. The slug never changes — see updateServer.
  const hasUrl = typeof body.url === "string" && body.url.trim();
  const hasName = typeof body.name === "string" && body.name.trim();
  if (hasUrl || hasName) {
    const patched = await updateServer(userId, body.slug.trim(), {
      ...(hasUrl ? { url: body.url!.trim() } : {}),
      ...(hasName ? { name: body.name!.trim() } : {}),
    });
    if (!patched.ok) return NextResponse.json(patched, { status: 400 });
    invalidateUser(userId);
    if (body.enabledTools === undefined) return NextResponse.json(patched);
  }

  // null ⇒ clear the choice (all tools). An array ⇒ exactly these, including the empty array,
  // which is a deliberate "none" and must not be re-read as "unset".
  let enabledTools: string[] | null;
  if (body.enabledTools === null || body.enabledTools === undefined) {
    enabledTools = null;
  } else if (Array.isArray(body.enabledTools) && body.enabledTools.every((v) => typeof v === "string")) {
    enabledTools = body.enabledTools as string[];
  } else {
    return NextResponse.json({ ok: false, error: "enabledTools phải là mảng chuỗi hoặc null" }, { status: 400 });
  }

  const result = await setEnabledTools(userId, body.slug.trim(), enabledTools);
  if (result.ok) invalidateUser(userId); // the cached discovery still carries the old set
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
