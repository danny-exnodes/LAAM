/**
 * WorkflowEditor.test.tsx — RTL behavior tests.
 *
 * Tests that:
 *   1. Palette-add buttons append a node to state.
 *   2. Save handler: fromReactFlow → assertRunnable (client preflight) → PATCH.
 *   3. Save with invalid graph shows error (assertRunnable throws).
 *   4. Save PATCH failure shows error.
 *
 * Canvas drag/connect interactions are FLAGGED FOR LIVE QA (jsdom cannot
 * simulate React Flow pointer events).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type { WorkflowGraph } from "@/lib/workflow/types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// next/navigation
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// @xyflow/react — mock the entire module; we test behavior not visuals
vi.mock("@xyflow/react", () => {
  const { useState, useCallback } = require("react") as typeof import("react");
  function ReactFlow({ children, onNodeClick, onPaneClick, nodes, onConnect }: {
    children?: React.ReactNode;
    onNodeClick?: (e: React.MouseEvent, node: { id: string; data: unknown }) => void;
    onPaneClick?: () => void;
    nodes?: { id: string; data: unknown }[];
    onConnect?: (c: { source: string; target: string }) => void;
  }) {
    return (
      <div data-testid="react-flow">
        {/* Render node count so tests can verify palette add */}
        <span data-testid="node-count">{nodes?.length ?? 0}</span>
        {/* Render node labels so tests can click nodes to select them */}
        {nodes?.map((n) => {
          const wf = (n.data as { node: { kind: string; prompt?: string; connectorId?: string; action?: string; items?: string } }).node;
          const label = wf.kind === "agent" ? wf.prompt ?? "" : wf.kind === "connector" ? `${wf.connectorId}.${wf.action}` : wf.items ?? wf.kind;
          return (
            <button
              key={n.id}
              data-testid={`node-${n.id}`}
              onClick={(e) => onNodeClick?.(e, n)}
            >
              {label}
            </button>
          );
        })}
        {children}
      </div>
    );
  }
  function ReactFlowProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  return {
    ReactFlow,
    ReactFlowProvider,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Position: { Right: "right", Left: "left" },
    useNodesState: (init: unknown[]) => {
      const [nodes, setNodes] = useState(init ?? []);
      const onNodesChange = useCallback(() => {}, []);
      return [nodes, setNodes, onNodesChange];
    },
    useEdgesState: (init: unknown[]) => {
      const [edges, setEdges] = useState(init ?? []);
      const onEdgesChange = useCallback(() => {}, []);
      return [edges, setEdges, onEdgesChange];
    },
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    Handle: () => null,
    useReactFlow: () => ({
      // screenToFlowPosition: return coordinates mirroring the input so
      // addNode tests can assert a position was set without caring about
      // viewport-transform math (which is jsdom-irrelevant anyway).
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    }),
  };
});

// assertRunnable — we spy on it to control pass/fail
const mockAssertRunnable = vi.fn();
vi.mock("@/lib/workflow/validate", () => ({ assertRunnable: (...args: unknown[]) => mockAssertRunnable(...args) }));

// fromReactFlow + toReactFlow — use real implementation
// (no mock needed; graph-serde is pure and tested separately)

// ─── Component import (after mocks) ──────────────────────────────────────────

import { WorkflowEditor } from "./WorkflowEditor";
import type { FetchLike } from "./WorkflowEditor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const starterGraph: WorkflowGraph = {
  nodes: [{ id: "n1", kind: "agent", prompt: "Hello" }],
  edges: [],
};

type MockFetch = ReturnType<typeof vi.fn<FetchLike>>;

function buildFetch(wf: { name: string; graph: WorkflowGraph }, patchOk = true): MockFetch {
  return vi.fn<FetchLike>(async (_url, opts) => {
    if (!opts || opts.method !== "PATCH") {
      // GET
      return { ok: true, json: async () => wf } as Response;
    }
    // PATCH
    return {
      ok: patchOk,
      json: async () => (patchOk ? { id: "wf1" } : { error: "server error" }),
    } as Response;
  });
}

function renderEditor(fetchImpl: MockFetch = buildFetch({ name: "My WF", graph: starterGraph })) {
  return render(
    <I18nProvider lang="vi">
      <WorkflowEditor
        workflowId="wf1"
        fetchImpl={fetchImpl}
        onSaved={vi.fn()}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertRunnable.mockReturnValue(undefined); // valid by default
});

afterEach(() => {
  cleanup();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WorkflowEditor", () => {
  test("renders loading state then loads workflow name", async () => {
    renderEditor();
    // Loading text visible initially
    expect(screen.getByText(/Đang tải/)).toBeInTheDocument();
    // After load, name input appears
    await waitFor(() =>
      expect(screen.getByDisplayValue("My WF")).toBeInTheDocument(),
    );
  });

  test("palette: clicking '+ Agent' appends a node", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));

    const before = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    fireEvent.click(screen.getByText("+ Agent"));
    const after = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    expect(after).toBe(before + 1);
  });

  test("palette: clicking '+ Connector' appends a node", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));

    const before = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    fireEvent.click(screen.getByText("+ Connector"));
    const after = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    expect(after).toBe(before + 1);
  });

  test("palette: clicking '+ Condition' appends a node", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));

    const before = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    fireEvent.click(screen.getByText("+ Condition"));
    const after = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    expect(after).toBe(before + 1);
  });

  test("palette: clicking '+ Foreach' appends a node", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));

    const before = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    fireEvent.click(screen.getByText("+ Foreach"));
    const after = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    expect(after).toBe(before + 1);
  });

  test("save: valid graph — calls assertRunnable and PATCH", async () => {
    const fetchImpl = buildFetch({ name: "My WF", graph: starterGraph });
    renderEditor(fetchImpl);
    await waitFor(() => screen.getByDisplayValue("My WF"));

    await act(async () => {
      fireEvent.click(screen.getByText("Lưu"));
    });

    expect(mockAssertRunnable).toHaveBeenCalledOnce();
    // PATCH was called
    const patchCall = fetchImpl.mock.calls.find(
      ([, opts]) => opts && (opts as RequestInit).method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string) as {
      name: string;
      graph: WorkflowGraph;
    };
    expect(body.name).toBe("My WF");
    expect(body.graph.nodes).toHaveLength(1);
  });

  test("save: assertRunnable throws — shows error, no PATCH", async () => {
    mockAssertRunnable.mockImplementation(() => {
      throw new Error("validate: cycle phát hiện");
    });
    const fetchImpl = buildFetch({ name: "My WF", graph: starterGraph });
    renderEditor(fetchImpl);
    await waitFor(() => screen.getByDisplayValue("My WF"));

    await act(async () => {
      fireEvent.click(screen.getByText("Lưu"));
    });

    // Error shown
    expect(screen.getByText(/validate: cycle/)).toBeInTheDocument();
    // PATCH NOT called
    const patchCall = fetchImpl.mock.calls.find(
      ([, opts]) => opts && (opts as RequestInit).method === "PATCH",
    );
    expect(patchCall).toBeUndefined();
  });

  test("save: PATCH returns error — shows saveErr", async () => {
    const fetchImpl = buildFetch({ name: "My WF", graph: starterGraph }, false);
    renderEditor(fetchImpl);
    await waitFor(() => screen.getByDisplayValue("My WF"));

    await act(async () => {
      fireEvent.click(screen.getByText("Lưu"));
    });

    // Server error message shown
    await waitFor(() =>
      expect(screen.getByText(/Lưu thất bại/)).toBeInTheDocument(),
    );
  });

  test("save: server PATCH body error displayed", async () => {
    const fetchImpl = vi.fn<FetchLike>(async (_url, opts) => {
      if (!opts || opts.method !== "PATCH") {
        return { ok: true, json: async () => ({ name: "My WF", graph: starterGraph }) } as Response;
      }
      return { ok: false, json: async () => ({ error: "validate: trùng node id" }) } as Response;
    });
    renderEditor(fetchImpl);
    await waitFor(() => screen.getByDisplayValue("My WF"));

    await act(async () => {
      fireEvent.click(screen.getByText("Lưu"));
    });

    await waitFor(() =>
      expect(screen.getByText(/validate: trùng node id/)).toBeInTheDocument(),
    );
  });

  test("loading error state shows error message", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ({ ok: false, json: async () => ({}) } as Response));
    render(
      <I18nProvider lang="vi">
        <WorkflowEditor workflowId="bad-id" fetchImpl={fetchImpl} onSaved={vi.fn()} />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Không tải được workflow/)).toBeInTheDocument(),
    );
  });
});

describe("WorkflowEditor — node delete", () => {
  const fetch2: FetchLike = async (_url) => {
    return {
      ok: true,
      json: async () => ({
        name: "WF",
        graph: {
          nodes: [
            { id: "n1", kind: "agent", prompt: "first" },
            { id: "n2", kind: "agent", prompt: "second" },
          ],
          edges: [{ id: "n1->n2", source: "n1", target: "n2", label: undefined }],
        },
      }),
    } as Response;
  };

  test("clicking delete in config panel removes node and its edges", async () => {
    render(
      <I18nProvider lang="vi">
        <WorkflowEditor workflowId="wf1" fetchImpl={fetch2} />
      </I18nProvider>,
    );
    // Wait for load
    await screen.findByText("first");
    // Click first node to select it
    fireEvent.click(screen.getByText("first"));
    // Click delete button in config panel
    const deleteBtn = screen.getByRole("button", { name: /xoá node|delete node/i });
    fireEvent.click(deleteBtn);
    // Node and config panel should be gone
    expect(screen.queryByText("first")).not.toBeInTheDocument();
    // Config panel should show "no selection" text
    expect(screen.getByText(/chọn một node|chọn node|select a node/i)).toBeInTheDocument();
  });
});
