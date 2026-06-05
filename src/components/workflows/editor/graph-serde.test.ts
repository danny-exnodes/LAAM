/**
 * graph-serde.test.ts — core correctness gate.
 *
 * fromReactFlow(toReactFlow(g)) must deep-equal g for every node kind
 * combination + condition true/false edges + foreach with body.
 *
 * These tests are the serialization round-trip contract.
 */
import { describe, expect, test } from "vitest";
import { toReactFlow, fromReactFlow } from "./graph-serde";
import type { WorkflowGraph, WfAgentNode, WfConnectorNode, WfConditionNode, WfForeachNode } from "@/lib/workflow/types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const agentNode: WfAgentNode = {
  id: "agent-1",
  kind: "agent",
  prompt: "Summarise {{input}}",
  system: "You are a helpful assistant.",
};

const connectorNode: WfConnectorNode = {
  id: "conn-1",
  kind: "connector",
  connectorId: "trello",
  action: "demo_list_tasks",
  args: { board: "{{boardId}}", limit: 10 },
};

const conditionNode: WfConditionNode = {
  id: "cond-1",
  kind: "condition",
  when: { left: "{{steps.conn-1.output.count}}", op: "gt", right: 0 },
};

// body is itself a WorkflowGraph — a single-node linear graph
const foreachBodyNode: WfAgentNode = {
  id: "body-n1",
  kind: "agent",
  prompt: "Process item {{item}}",
};
const foreachBody: WorkflowGraph = {
  nodes: [foreachBodyNode],
  edges: [],
};

const foreachNode: WfForeachNode = {
  id: "foreach-1",
  kind: "foreach",
  items: "{{steps.conn-1.output.items}}",
  body: foreachBody,
};

// ─── Round-trip helpers ───────────────────────────────────────────────────────

function roundTrip(graph: WorkflowGraph): WorkflowGraph {
  const { nodes, edges } = toReactFlow(graph);
  return fromReactFlow(nodes, edges);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("toReactFlow", () => {
  test("maps each WfNode id to an RF node id", () => {
    const graph: WorkflowGraph = {
      nodes: [agentNode, connectorNode],
      edges: [{ from: "agent-1", to: "conn-1" }],
    };
    const { nodes, edges } = toReactFlow(graph);
    expect(nodes.map((n) => n.id)).toEqual(["agent-1", "conn-1"]);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("agent-1");
    expect(edges[0].target).toBe("conn-1");
  });

  test("edge label is set on RF edge", () => {
    const graph: WorkflowGraph = {
      nodes: [conditionNode, agentNode, connectorNode],
      edges: [
        { from: "cond-1", to: "agent-1", label: "true" },
        { from: "cond-1", to: "conn-1", label: "false" },
      ],
    };
    const { edges } = toReactFlow(graph);
    const trueEdge = edges.find((e) => e.label === "true");
    const falseEdge = edges.find((e) => e.label === "false");
    expect(trueEdge).toBeDefined();
    expect(falseEdge).toBeDefined();
    expect(trueEdge!.source).toBe("cond-1");
    expect(trueEdge!.target).toBe("agent-1");
    expect(falseEdge!.source).toBe("cond-1");
    expect(falseEdge!.target).toBe("conn-1");
  });

  test("each node has type='wf' and data.node === original WfNode", () => {
    const graph: WorkflowGraph = { nodes: [agentNode], edges: [] };
    const { nodes } = toReactFlow(graph);
    expect(nodes[0].type).toBe("wf");
    expect(nodes[0].data.node).toEqual(agentNode);
  });

  test("positions are auto-assigned (x spaced, y=0)", () => {
    const graph: WorkflowGraph = {
      nodes: [agentNode, connectorNode, conditionNode],
      edges: [],
    };
    const { nodes } = toReactFlow(graph);
    // positions exist and x increases
    expect(nodes[0].position.x).toBeLessThan(nodes[1].position.x);
    expect(nodes[1].position.x).toBeLessThan(nodes[2].position.x);
  });
});

describe("fromReactFlow", () => {
  test("strips RF fields — only WfNode payload preserved", () => {
    const { nodes, edges } = toReactFlow({ nodes: [agentNode], edges: [] });
    // Simulate RF adding extra fields that should be stripped
    nodes[0] = { ...nodes[0], selected: true, dragging: true };
    const result = fromReactFlow(nodes, edges);
    expect(result.nodes[0]).toEqual(agentNode);
    expect("selected" in result.nodes[0]).toBe(false);
  });

  test("edge without label → WfEdge has no label field", () => {
    const rfEdge = { id: "e1", source: "a", target: "b" };
    const result = fromReactFlow([], [rfEdge]);
    expect(result.edges[0]).toEqual({ from: "a", to: "b" });
    expect("label" in result.edges[0]).toBe(false);
  });

  test("edge with label → label preserved", () => {
    const rfEdge = { id: "e1", source: "a", target: "b", label: "true" };
    const result = fromReactFlow([], [rfEdge]);
    expect(result.edges[0].label).toBe("true");
  });

  test("empty label string → treated as no label", () => {
    const rfEdge = { id: "e1", source: "a", target: "b", label: "" };
    const result = fromReactFlow([], [rfEdge]);
    expect("label" in result.edges[0]).toBe(false);
  });
});

// ─── Round-trip: core correctness gate ───────────────────────────────────────

describe("round-trip: fromReactFlow(toReactFlow(g)) deep-equals g", () => {
  test("agent node (with system prompt)", () => {
    const graph: WorkflowGraph = { nodes: [agentNode], edges: [] };
    expect(roundTrip(graph)).toEqual(graph);
  });

  test("connector node (with args record)", () => {
    const graph: WorkflowGraph = { nodes: [connectorNode], edges: [] };
    expect(roundTrip(graph)).toEqual(graph);
  });

  test("condition node (composite predicate)", () => {
    const graph: WorkflowGraph = { nodes: [conditionNode], edges: [] };
    expect(roundTrip(graph)).toEqual(graph);
  });

  test("foreach node (with body graph)", () => {
    const graph: WorkflowGraph = { nodes: [foreachNode], edges: [] };
    expect(roundTrip(graph)).toEqual(graph);
  });

  test("all 4 kinds + condition true/false edges + foreach body", () => {
    // Full graph: agent → connector → condition →(true) agent2
    //                                           →(false) foreach
    const agent2: WfAgentNode = { id: "agent-2", kind: "agent", prompt: "Final step" };
    const graph: WorkflowGraph = {
      nodes: [agentNode, connectorNode, conditionNode, agent2, foreachNode],
      edges: [
        { from: "agent-1", to: "conn-1" },
        { from: "conn-1", to: "cond-1" },
        { from: "cond-1", to: "agent-2", label: "true" },
        { from: "cond-1", to: "foreach-1", label: "false" },
      ],
    };
    const result = roundTrip(graph);
    expect(result).toEqual(graph);
  });

  test("edge labels (true/false) survive round-trip exactly", () => {
    const graph: WorkflowGraph = {
      nodes: [conditionNode, agentNode, connectorNode],
      edges: [
        { from: "cond-1", to: "agent-1", label: "true" },
        { from: "cond-1", to: "conn-1", label: "false" },
      ],
    };
    const result = roundTrip(graph);
    const trueEdge = result.edges.find((e) => e.label === "true");
    const falseEdge = result.edges.find((e) => e.label === "false");
    expect(trueEdge).toEqual({ from: "cond-1", to: "agent-1", label: "true" });
    expect(falseEdge).toEqual({ from: "cond-1", to: "conn-1", label: "false" });
  });

  test("edge without label survives round-trip with no label field", () => {
    const graph: WorkflowGraph = {
      nodes: [agentNode, connectorNode],
      edges: [{ from: "agent-1", to: "conn-1" }],
    };
    const result = roundTrip(graph);
    expect(result.edges[0]).toEqual({ from: "agent-1", to: "conn-1" });
    expect("label" in result.edges[0]).toBe(false);
  });

  test("foreach body graph survives round-trip (nested graph)", () => {
    const deepBody: WorkflowGraph = {
      nodes: [
        { id: "b-agent", kind: "agent", prompt: "Body step" },
        { id: "b-conn", kind: "connector", connectorId: "slack", action: "send", args: {} },
      ],
      edges: [{ from: "b-agent", to: "b-conn" }],
    };
    const fNode: WfForeachNode = {
      id: "fe-1",
      kind: "foreach",
      items: "{{items}}",
      body: deepBody,
    };
    const graph: WorkflowGraph = { nodes: [fNode], edges: [] };
    const result = roundTrip(graph);
    const resultForeach = result.nodes[0] as WfForeachNode;
    expect(resultForeach.kind).toBe("foreach");
    expect(resultForeach.body).toEqual(deepBody);
  });

  test("condition node with compound predicate (all/any)", () => {
    const cond: WfConditionNode = {
      id: "cond-compound",
      kind: "condition",
      when: {
        all: [
          { left: "{{x}}", op: "gt", right: 0 },
          { any: [{ left: "{{y}}", op: "eq", right: "yes" }, { left: "{{z}}", op: "exists" }] },
        ],
      },
    };
    const graph: WorkflowGraph = { nodes: [cond], edges: [] };
    expect(roundTrip(graph)).toEqual(graph);
  });

  test("agent node without optional system prompt", () => {
    const noSystem: WfAgentNode = { id: "a1", kind: "agent", prompt: "minimal" };
    const graph: WorkflowGraph = { nodes: [noSystem], edges: [] };
    const result = roundTrip(graph);
    expect(result.nodes[0]).toEqual(noSystem);
    expect((result.nodes[0] as WfAgentNode).system).toBeUndefined();
  });

  test("empty graph (0 nodes, 0 edges)", () => {
    const graph: WorkflowGraph = { nodes: [], edges: [] };
    expect(roundTrip(graph)).toEqual(graph);
  });
});
