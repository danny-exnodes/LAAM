import { describe, it, expect } from "vitest";
import { buildNodes } from "./nodeModel";
import type { CatalogGroup } from "@/lib/chat/toolCatalog";

const grp = (id: string, label: string): CatalogGroup => ({ id, type: "connector", label, tools: [{ name: `${id}.t`, description: "", kind: "read", args: [] }] });

describe("buildNodes", () => {
  it("puts agents on the inner ring and marks the selected one active", () => {
    const nodes = buildNodes({ agents: [{ id: "a1", name: "Alpha" }, { id: "a2", name: "Beta" }], groups: [], connectors: [], selectedAgentId: "a2" });
    expect(nodes.filter(n => n.ring === "inner")).toHaveLength(2);
    expect(nodes.find(n => n.ref.kind === "agent" && n.ref.agentId === "a2")!.state).toBe("active");
    expect(nodes.find(n => n.ref.kind === "agent" && n.ref.agentId === "a1")!.state).toBe("linked");
  });

  it("puts tool groups on the outer ring as linked, carrying the SOURCE object (Rule 13)", () => {
    const g = grp("connector:x", "X");
    const nodes = buildNodes({ agents: [], groups: [g], connectors: [], selectedAgentId: undefined });
    const n = nodes.find(x => x.ring === "outer")!;
    expect(n.state).toBe("linked");
    expect(n.ref.kind === "tool" && n.ref.group).toBe(g); // identical reference, not a copy
  });

  it("adds disconnected/needs_reconnect connectors as idle nodes", () => {
    const nodes = buildNodes({ agents: [], groups: [], connectors: [
      { id: "gmail", name: "Gmail", status: "disconnected" },
      { id: "jira", name: "Jira", status: "needs_reconnect" },
      { id: "slack", name: "Slack", status: "connected" },
    ], selectedAgentId: undefined });
    const idle = nodes.filter(n => n.state === "idle");
    expect(idle.map(n => n.label).sort()).toEqual(["Gmail", "Jira"]);
    // "connected" ones are represented by their catalog group, not duplicated here
    expect(nodes.find(n => n.label === "Slack")).toBeUndefined();
  });

  it("marks all agents linked when none is selected", () => {
    const nodes = buildNodes({ agents: [{ id: "a1", name: "A" }, { id: "a2", name: "B" }], groups: [], connectors: [], selectedAgentId: undefined });
    expect(nodes.filter(n => n.ref.kind === "agent").every(n => n.state === "linked")).toBe(true);
  });
});
