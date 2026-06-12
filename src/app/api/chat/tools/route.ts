// Catalog tool per-user cho quick-tools picker (P1). Read-only — không cần
// requireMutator. Best-effort từng nguồn: một nguồn sập không được làm mất picker
// (internal tools luôn có).
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { INTERNAL_TOOLS } from "@/lib/agent/registry";
import { list, chatTools } from "@/lib/connectors";
import { listServers } from "@/lib/connectors/mcp/store";
import { buildCatalogGroups } from "@/lib/chat/toolCatalog";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const [connectors, tools, servers] = await Promise.all([
    list(userId).catch(() => []),
    chatTools(userId).catch(() => []),
    listServers(userId).catch(() => []),
  ]);

  return NextResponse.json({
    groups: buildCatalogGroups({
      internal: INTERNAL_TOOLS,
      connectors,
      chatTools: tools,
      servers: servers.map((s) => ({ slug: s.slug, name: s.name })),
    }),
  });
}
