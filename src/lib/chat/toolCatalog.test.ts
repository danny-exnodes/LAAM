// P1 quick-tools: catalog nhóm Internal / Connector / MCP cho picker.
// Test intent: (1) kind tự khai + fail-closed write khi thiếu; (2) chỉ connector
// ĐÃ kết nối; (3) MCP group theo server với label thân thiện; (4) required-args
// trích từ JSON Schema — đây là dữ liệu UI dẫn nhập (project_id UUID...).
import { describe, expect, test } from "vitest";
import { buildCatalogGroups, mcpSlugOf } from "./toolCatalog";
import type { Tool } from "@/lib/agent/types";
import type { ConnectorListItem, ConnectorTool } from "@/lib/connectors/types";

const internal: Tool[] = [
  {
    name: "laam_list_agents",
    description: "liệt kê agent",
    kind: "read",
    parameters: { type: "object", properties: { sort: { type: "string", enum: ["recent", "cost"] } } },
    handler: async () => ({}),
  },
];

const connectors = [
  {
    id: "demo",
    name: "Demo",
    connected: true,
    tools: [
      {
        name: "demo_create_task",
        description: "tạo task",
        parameters: { type: "object", properties: { title: { type: "string", description: "tên task" } }, required: ["title"] },
      },
    ],
  },
  {
    id: "trello",
    name: "Trello",
    connected: false,
    tools: [{ name: "trello_create_card", description: "x", parameters: {} }],
  },
] as unknown as ConnectorListItem[];

const chatToolsArr = [
  { type: "function", kind: "write", function: { name: "demo_create_task", description: "tạo task", parameters: {} } },
  {
    type: "function",
    kind: "read",
    function: {
      name: "mcp__daab__kg_query",
      description: "truy vấn KG",
      parameters: { type: "object", properties: { project_id: { type: "string", description: "UUID dự án" } }, required: ["project_id"] },
    },
  },
] as ConnectorTool[];

describe("buildCatalogGroups", () => {
  const groups = buildCatalogGroups({
    internal,
    connectors,
    chatTools: chatToolsArr,
    servers: [{ slug: "daab", name: "DAAB" }],
  });

  test("internal group đứng đầu, kind tự khai, args từ schema", () => {
    expect(groups[0]).toMatchObject({ id: "internal", type: "internal" });
    expect(groups[0].tools[0]).toMatchObject({ name: "laam_list_agents", kind: "read" });
    expect(groups[0].tools[0].args[0]).toMatchObject({ key: "sort", kind: "enum", required: false });
  });

  test("chỉ connector ĐÃ kết nối; kind lấy từ chatTools; required args đúng", () => {
    const demo = groups.find((g) => g.id === "connector:demo");
    expect(demo).toBeDefined();
    expect(demo!.label).toBe("Demo");
    expect(demo!.tools[0]).toMatchObject({ name: "demo_create_task", kind: "write" });
    expect(demo!.tools[0].args[0]).toMatchObject({ key: "title", required: true });
    expect(groups.find((g) => g.id === "connector:trello")).toBeUndefined();
  });

  test("MCP group theo server, label = tên server, tool giữ tên namespaced", () => {
    const daab = groups.find((g) => g.id === "mcp:daab");
    expect(daab).toBeDefined();
    expect(daab!.label).toBe("DAAB");
    expect(daab!.tools[0]).toMatchObject({ name: "mcp__daab__kg_query", kind: "read" });
    expect(daab!.tools[0].args[0]).toMatchObject({ key: "project_id", required: true, description: "UUID dự án" });
  });

  test("server không có trong listServers → label fallback slug", () => {
    const g = buildCatalogGroups({ internal: [], connectors: [], chatTools: chatToolsArr, servers: [] });
    expect(g.find((x) => x.id === "mcp:daab")!.label).toBe("daab");
  });

  test("connector tool thiếu trong chatTools → kind fail-closed write", () => {
    const g = buildCatalogGroups({ internal: [], connectors: [connectors[0]], chatTools: [], servers: [] });
    expect(g.find((x) => x.id === "connector:demo")!.tools[0].kind).toBe("write");
  });
});

describe("mcpSlugOf", () => {
  test("parse slug từ tên namespaced", () => {
    expect(mcpSlugOf("mcp__daab__kg_query")).toBe("daab");
    expect(mcpSlugOf("mcp__daab__kg_get_node")).toBe("daab");
  });
  test("không phải MCP / thiếu phần tool → null", () => {
    expect(mcpSlugOf("demo_create_task")).toBeNull();
    expect(mcpSlugOf("mcp__daab")).toBeNull();
  });
});
