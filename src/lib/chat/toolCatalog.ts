// Catalog tool theo NHÓM cho quick-tools picker (P1). Pure — route chỉ làm I/O.
// kind connector/MCP lấy từ chatTools() (tự khai); thiếu → fail-closed "write".
// args = ArgField[] trích từ JSON Schema (parseArgSchema) để UI dẫn nhập
// required-args (project_id UUID, idList...) — model không phải đoán.
import type { Tool } from "@/lib/agent/types";
import type { ConnectorListItem, ConnectorTool } from "@/lib/connectors/types";
import { parseArgSchema, type ArgField } from "@/components/workflows/editor/schemaForm";

export type CatalogTool = { name: string; description: string; kind: "read" | "write"; args: ArgField[] };
export type CatalogGroup = { id: string; type: "internal" | "connector" | "mcp"; label: string; tools: CatalogTool[] };

const MCP_NS = "mcp__";

// Review-fix: input type=number có thể cho chuỗi rỗng/không-parse-được — KHÔNG bao
// giờ trả NaN (NaN JSON-hoá thành null = hỏng dữ liệu im lặng, Rule 12).
export function coerceNumberInput(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

export function mcpSlugOf(name: string): string | null {
  if (!name.startsWith(MCP_NS)) return null;
  const rest = name.slice(MCP_NS.length);
  const i = rest.indexOf("__");
  return i > 0 ? rest.slice(0, i) : null;
}

export function buildCatalogGroups(opts: {
  internal: Tool[];
  connectors: ConnectorListItem[];
  chatTools: ConnectorTool[];
  servers: { slug: string; name: string }[];
}): CatalogGroup[] {
  const kinds = new Map(opts.chatTools.map((t) => [t.function.name, t.kind] as const));
  const groups: CatalogGroup[] = [];

  groups.push({
    id: "internal",
    type: "internal",
    label: "LAAM",
    tools: opts.internal.map((t) => ({
      name: t.name,
      description: t.description,
      kind: t.kind,
      args: parseArgSchema(t.parameters).fields,
    })),
  });

  for (const c of opts.connectors) {
    if (!c.connected) continue;
    groups.push({
      id: `connector:${c.id}`,
      type: "connector",
      label: c.name,
      tools: c.tools.map((ti) => ({
        name: ti.name,
        description: ti.description,
        kind: kinds.get(ti.name) ?? "write",
        args: parseArgSchema(ti.parameters).fields,
      })),
    });
  }

  const serverName = new Map(opts.servers.map((s) => [s.slug, s.name]));
  const bySlug = new Map<string, CatalogTool[]>();
  for (const t of opts.chatTools) {
    const slug = mcpSlugOf(t.function.name);
    if (!slug) continue;
    const arr = bySlug.get(slug) ?? [];
    arr.push({
      name: t.function.name,
      description: t.function.description,
      kind: t.kind,
      args: parseArgSchema(t.function.parameters).fields,
    });
    bySlug.set(slug, arr);
  }
  for (const [slug, tools] of bySlug) {
    groups.push({ id: `mcp:${slug}`, type: "mcp", label: serverName.get(slug) ?? slug, tools });
  }
  return groups;
}
