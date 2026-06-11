import { describe, expect, test } from "vitest";
import { buildCatalog, coerceGraph, generationSystem, GRAPH_FORMAT, buildUserMessage } from "./generate";
import { assertRunnable } from "./validate";
import type { ConnectorListItem } from "@/lib/connectors/types";

describe("buildCatalog", () => {
  test("lists connectors + tools with their param keys", () => {
    const conns = [
      {
        id: "demo",
        name: "Demo",
        connected: true,
        tools: [
          { name: "demo_list_tasks", description: "List tasks", parameters: { type: "object", properties: { status: {} } } },
        ],
      },
    ] as unknown as ConnectorListItem[];
    const cat = buildCatalog(conns);
    expect(cat).toContain("demo (Demo)");
    expect(cat).toContain("demo_list_tasks(status)");
    expect(cat).toContain("List tasks");
  });
  test("empty connectors → placeholder", () => {
    expect(buildCatalog([])).toContain("no connectors");
  });
});

describe("coerceGraph (Rule 13: code re-derives, never trusts the model)", () => {
  test("keeps valid unique ids + kinds; coerces fields", () => {
    const g = coerceGraph({
      nodes: [
        { id: "a", kind: "connector", connectorId: "demo", action: "x", args: { k: "v" } },
        { id: "b", kind: "agent", prompt: "hi {{steps.a.output}}" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    expect(g.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(g.nodes[0]).toMatchObject({ kind: "connector", connectorId: "demo", action: "x", args: { k: "v" } });
    expect(g.edges).toEqual([{ from: "a", to: "b" }]);
  });

  test("re-ids DUPLICATE ids and remaps edges to the first occurrence", () => {
    const g = coerceGraph({
      nodes: [
        { id: "dup", kind: "agent", prompt: "1" },
        { id: "dup", kind: "agent", prompt: "2" },
      ],
      edges: [{ from: "dup", to: "dup" }],
    });
    const ids = g.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(2); // both unique now
    expect(ids[0]).toBe("dup");
    expect(ids[1]).not.toBe("dup"); // second was de-duped
    expect(g.edges[0]).toEqual({ from: "dup", to: "dup" }); // remapped to the first occurrence
  });

  test("generates ids for missing/blank, and falls unknown kinds back to agent", () => {
    const g = coerceGraph({
      nodes: [
        { kind: "weird", prompt: "x" },
        { id: "  ", kind: "agent", prompt: "y" },
      ],
      edges: [],
    });
    expect(g.nodes[0].kind).toBe("agent"); // unknown kind → agent
    expect(g.nodes.every((n) => n.id.trim().length > 0)).toBe(true);
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(2);
  });

  test("coerces non-object args to {} and drops non-true/false edge labels", () => {
    const g = coerceGraph({
      nodes: [{ id: "c", kind: "connector", connectorId: "x", action: "y", args: "not-an-object" }],
      edges: [{ from: "c", to: "d", label: "garbage" }],
    });
    expect((g.nodes[0] as { args: unknown }).args).toEqual({});
    expect("label" in g.edges[0]).toBe(false);
  });

  test("recurses into foreach.body", () => {
    const g = coerceGraph({
      nodes: [
        { id: "f", kind: "foreach", items: "{{x}}", body: { nodes: [{ id: "inner", kind: "agent", prompt: "z" }], edges: [] } },
      ],
      edges: [],
    });
    const fe = g.nodes[0] as { kind: string; body: { nodes: { id: string }[] } };
    expect(fe.kind).toBe("foreach");
    expect(fe.body.nodes[0].id).toBe("inner");
  });

  test("garbage input → empty graph (never throws)", () => {
    expect(coerceGraph(null)).toEqual({ nodes: [], edges: [] });
    expect(coerceGraph({ nodes: "nope" })).toEqual({ nodes: [], edges: [] });
    expect(coerceGraph("💥")).toEqual({ nodes: [], edges: [] });
  });

  test("a coerced model graph passes assertRunnable (the validity gate)", () => {
    const g = coerceGraph({
      nodes: [
        { id: "list", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
        { id: "sum", kind: "agent", prompt: "Summarize {{steps.list.output}}" },
      ],
      edges: [{ from: "list", to: "sum" }],
    });
    expect(() => assertRunnable(g)).not.toThrow();
  });
});

describe("generationSystem + GRAPH_FORMAT", () => {
  test("system prompt embeds the catalog + DSL constraints", () => {
    const sys = generationSystem("  • demo (Demo)");
    expect(sys).toContain("demo (Demo)");
    expect(sys).toContain("condition");
    expect(sys).toContain("{{steps.");
  });
  test("format schema requires nodes + edges arrays", () => {
    expect(GRAPH_FORMAT.required).toEqual(["nodes", "edges"]);
    expect(GRAPH_FORMAT.properties.nodes.type).toBe("array");
  });
});

// ── B1: structured output — AI-builder biết field `format` trên agent node ──
describe("agent format field (B1 structured output)", () => {
  test("coerceGraph giữ format object trên agent node", () => {
    const g = coerceGraph({
      nodes: [{ id: "j", kind: "agent", prompt: "judge", format: { type: "object", properties: { verdict: {} } } }],
      edges: [],
    });
    expect(g.nodes[0]).toMatchObject({ kind: "agent", format: { type: "object", properties: { verdict: {} } } });
  });

  test("coerceGraph bỏ format không phải plain object (Rule 13)", () => {
    const g = coerceGraph({
      nodes: [
        { id: "a", kind: "agent", prompt: "x", format: "not-an-object" },
        { id: "b", kind: "agent", prompt: "y", format: [1] },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    expect("format" in g.nodes[0]).toBe(false);
    expect("format" in g.nodes[1]).toBe(false);
  });

  test("GRAPH_FORMAT cho phép field format; system prompt nhắc tới nó", () => {
    expect(GRAPH_FORMAT.properties.nodes.items.properties).toHaveProperty("format");
    expect(generationSystem("(none)")).toContain("format");
  });
});

describe("buildUserMessage (refine — #3 stretch)", () => {
  test("plain prompt when there's no current graph (or it's empty)", () => {
    expect(buildUserMessage("make a flow")).toBe("make a flow");
    expect(buildUserMessage("x", { nodes: [], edges: [] })).toBe("x"); // empty → generate, not edit
  });
  test("an edit instruction embedding the current graph when non-empty", () => {
    const cur = { nodes: [{ id: "a", kind: "agent", prompt: "hi" }], edges: [] };
    const msg = buildUserMessage("đổi sang Gmail", cur);
    expect(msg).toContain("Workflow hiện tại");
    expect(msg).toContain(JSON.stringify(cur));
    expect(msg).toContain("đổi sang Gmail");
    expect(msg).toContain("TOÀN BỘ graph"); // asks for the full edited graph back
  });
});
