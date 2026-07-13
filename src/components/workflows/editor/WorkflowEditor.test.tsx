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
  within,
} from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type { WorkflowGraph } from "@/lib/workflow/types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// next/navigation
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// @xyflow/react — mock the entire module; we test behavior not visuals
vi.mock("@xyflow/react", () => {
  const { useState, useCallback } = require("react") as typeof import("react");
  function ReactFlow({ children, onNodeClick, onPaneClick, nodes, nodeTypes, onConnect, edges, onEdgeClick }: {
    children?: React.ReactNode;
    onNodeClick?: (e: React.MouseEvent, node: { id: string; data: unknown }) => void;
    onPaneClick?: () => void;
    nodes?: { id: string; data: unknown }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeTypes?: Record<string, React.ComponentType<any>>;
    onConnect?: (c: { source: string; target: string }) => void;
    edges?: { id: string; label?: unknown }[];
    onEdgeClick?: (e: React.MouseEvent, edge: { id: string; label?: unknown }) => void;
  }) {
    const [mockSelectedId, setMockSelectedId] = useState<string | null>(null);
    return (
      <div data-testid="react-flow">
        {/* Render node count so tests can verify palette add */}
        <span data-testid="node-count">{nodes?.length ?? 0}</span>
        {/* Render node labels so tests can click nodes to select them.
            Also render the actual nodeType component (e.g. WfNodeCard) so that
            NodeToolbar and other inner UI are testable. */}
        {nodes?.map((n) => {
          const wf = (n.data as { node: { kind: string; prompt?: string; connectorId?: string; action?: string; items?: string } }).node;
          const label = wf.kind === "agent" ? wf.prompt ?? "" : wf.kind === "connector" ? `${wf.connectorId}.${wf.action}` : wf.items ?? wf.kind;
          const NodeComp = nodeTypes?.wf;
          return (
            <div key={n.id}>
              <button
                data-testid={`node-${n.id}`}
                onClick={(e) => {
                  setMockSelectedId(n.id);
                  onNodeClick?.(e, n);
                }}
              >
                {label}
              </button>
              {NodeComp && (
                <NodeComp data={n.data} selected={mockSelectedId === n.id} id={n.id} />
              )}
            </div>
          );
        })}
        {/* Render edges as buttons so tests can click them (fires onEdgeClick). */}
        {edges?.map((e, i) => (
          <button key={e.id ?? i} data-testid={`edge-${i}`} onClick={(ev) => onEdgeClick?.(ev, e)}>
            {String(e.label ?? "edge")}
          </button>
        ))}
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
    NodeToolbar: ({ children, isVisible }: { children: React.ReactNode; isVisible?: boolean }) =>
      isVisible ? <>{children}</> : null,
    MarkerType: { ArrowClosed: "arrowclosed" },
    useReactFlow: () => ({
      // screenToFlowPosition: return coordinates mirroring the input so
      // addNode tests can assert a position was set without caring about
      // viewport-transform math (which is jsdom-irrelevant anyway).
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
      fitView: () => {},
      setCenter: (x: number, y: number) => panCalls.push([x, y]),
    }),
  };
});

// Records auto-pan setCenter() calls so the "follow execution" test can assert.
const { panCalls } = vi.hoisted(() => ({ panCalls: [] as Array<[number, number]> }));

// assertRunnable — we spy on it to control pass/fail. collectIssues is the
// advisory authoring-time validator; default to "no issues" so badges/panel
// don't interfere with the save-path assertions below.
const mockAssertRunnable = vi.fn();
const mockCollectIssues = vi.fn((..._args: unknown[]) => [] as unknown[]);
vi.mock("@/lib/workflow/validate", () => ({
  assertRunnable: (...args: unknown[]) => mockAssertRunnable(...args),
  collectIssues: (...args: unknown[]) => mockCollectIssues(...args),
}));

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
  mockCollectIssues.mockReturnValue([]); // no authoring issues by default
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

  // P4: mobile palette derive từ NODE_TYPES — parity TỰ ĐỘNG với desktop library
  // (thêm kind mới 1 chỗ là cả hai cùng có). Click theo within(mobile-palette) vì
  // label wf.lib.<kind>.name cũng xuất hiện ở desktop NodesLibraryPanel.
  async function clickPalette(label: string | RegExp) {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));
    const palette = screen.getByTestId("mobile-palette");
    const before = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    fireEvent.click(within(palette).getByText(label));
    const after = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    expect(after).toBe(before + 1);
  }

  test("palette: clicking 'Agent' appends a node", async () => {
    await clickPalette("Agent");
  });

  test("palette: clicking 'Connector' appends a node", async () => {
    await clickPalette("Connector");
  });

  test("palette: clicking 'Điều kiện' appends a node", async () => {
    await clickPalette("Điều kiện");
  });

  test("palette: clicking 'Lặp (Foreach)' appends a node", async () => {
    await clickPalette(/Lặp/);
  });

  test("palette: clicking 'MCP' appends a node (P4 parity với node kind mới)", async () => {
    await clickPalette("MCP");
  });

  test("palette: đủ 5 nút = NODE_TYPES.length (parity desktop↔mobile)", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));
    const palette = screen.getByTestId("mobile-palette");
    expect(within(palette).getAllByRole("button")).toHaveLength(5);
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

  test("save: toggle Song song → graph.parallel=true trong PATCH (giữ cờ qua round-trip fromReactFlow)", async () => {
    // WHY: fromReactFlow bỏ cờ parallel; nếu editor không tự giữ, lưu 1 workflow song song
    // sẽ mất flag → fan-in bị validator từ chối lần chạy sau. Đây là guard cho lỗi đó.
    const fetchImpl = buildFetch({ name: "My WF", graph: starterGraph });
    renderEditor(fetchImpl);
    await waitFor(() => screen.getByDisplayValue("My WF"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("parallel-toggle"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Lưu"));
    });

    const patchCall = fetchImpl.mock.calls.find(
      ([, opts]) => opts && (opts as RequestInit).method === "PATCH",
    );
    const body = JSON.parse((patchCall![1] as RequestInit).body as string) as { graph: WorkflowGraph };
    expect(body.graph.parallel).toBe(true);
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
    await screen.findByTestId("node-n1");
    // Click first node to select it
    fireEvent.click(screen.getByTestId("node-n1"));
    // Click delete button in config panel (Vietnamese aria-label "Xoá node")
    // getAllByRole: both desktop (hidden md:block) and mobile (md:hidden) panels render in jsdom
    const deleteBtn = screen.getAllByRole("button", { name: /xoá node/i })[0];
    fireEvent.click(deleteBtn);
    // Node and config panel should be gone
    expect(screen.queryByTestId("node-n1")).not.toBeInTheDocument();
    // Config panel should show "no selection" text
    expect(screen.getByText(/chọn một node|chọn node|select a node/i)).toBeInTheDocument();
  });
});

describe("WorkflowEditor — dirty / unsaved guard", () => {
  // fetchReadOnly: only serves GET, no PATCH
  const fetchReadOnly: FetchLike = async () =>
    ({ ok: true, json: async () => ({ name: "WF", graph: { nodes: [], edges: [] } }) }) as Response;

  test("save button shows ● dot indicator when name changes", async () => {
    render(
      <I18nProvider lang="vi">
        <WorkflowEditor workflowId="wf1" fetchImpl={fetchReadOnly} onSaved={vi.fn()} />
      </I18nProvider>,
    );
    await screen.findByDisplayValue("WF");
    const saveBtn = screen.getByRole("button", { name: /lưu|save/i });
    // Before any edit: no dot
    expect(saveBtn.textContent).not.toContain("●");
    // After name edit: dot appears
    fireEvent.change(screen.getByRole("textbox", { name: /tên workflow|workflow name/i }), {
      target: { value: "New Name" },
    });
    expect(screen.getByRole("button", { name: /lưu|save/i }).textContent).toContain("●");
  });

  test("● dot cleared after successful save", async () => {
    const patchFetch: FetchLike = async (_url, opts) => {
      if (opts?.method === "PATCH") return { ok: true, json: async () => ({}) } as Response;
      return { ok: true, json: async () => ({ name: "WF", graph: { nodes: [], edges: [] } }) } as Response;
    };
    const onSaved = vi.fn();
    render(
      <I18nProvider lang="vi">
        <WorkflowEditor workflowId="wf1" fetchImpl={patchFetch} onSaved={onSaved} />
      </I18nProvider>,
    );
    await screen.findByDisplayValue("WF");
    // Make dirty by editing name
    fireEvent.change(screen.getByRole("textbox", { name: /tên workflow|workflow name/i }), {
      target: { value: "X" },
    });
    expect(screen.getByRole("button", { name: /lưu|save/i }).textContent).toContain("●");
    // Save
    fireEvent.click(screen.getByRole("button", { name: /lưu|save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    // After save: dot gone
    expect(screen.getByRole("button", { name: /lưu|save/i }).textContent).not.toContain("●");
  });
});

describe("WorkflowEditor — node toolbar", () => {
  test("copy button on selected node appends a new node of the same kind", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));

    const before = parseInt(screen.getByTestId("node-count").textContent ?? "0");

    // Click the node to select it (mock fires onNodeClick → sets selectedId)
    fireEvent.click(screen.getByTestId("node-n1"));

    // NodeToolbar is now visible (isVisible={selected=true} in mock renders children)
    // The toolbar has a "Copy node" button
    const copyBtn = screen.getByRole("button", { name: /copy node/i });
    fireEvent.click(copyBtn);

    const after = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    expect(after).toBe(before + 1);
  });

  test("delete button on toolbar removes the selected node", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));

    const before = parseInt(screen.getByTestId("node-count").textContent ?? "0");

    fireEvent.click(screen.getByTestId("node-n1"));
    fireEvent.click(screen.getByTestId("toolbar-delete"));

    const after = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    expect(after).toBe(before - 1);
  });
});

describe("WorkflowEditor — mobile config sheet (H)", () => {
  test("selecting a node mounts the animated bottom sheet (dialog)", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));
    // No sheet before any selection
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Selecting a node mounts the bottom sheet
    fireEvent.click(screen.getByTestId("node-n1"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("close button on the sheet deselects the node", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));
    fireEvent.click(screen.getByTestId("node-n1"));
    const sheet = screen.getByRole("dialog");
    // Close (aria-label i18n: vi "Đóng" / en "Close")
    fireEvent.click(within(sheet).getByRole("button", { name: /đóng|close/i }));
    // Desktop panel falls back to the no-selection prompt
    expect(screen.getByText(/chọn một node|select a node/i)).toBeInTheDocument();
  });
});

describe("WorkflowEditor — Test (dry-run) button", () => {
  test("saves dirty graph then POSTs a dry-run and reports the runId", async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url, opts) => {
      const u = String(url);
      if (u.endsWith("/run")) {
        return { ok: true, json: async () => ({ run: { id: "run-xyz" }, steps: [] }) } as Response;
      }
      if (opts?.method === "PATCH") {
        return { ok: true, json: async () => ({ id: "wf1" }) } as Response;
      }
      return { ok: true, json: async () => ({ name: "My WF", graph: starterGraph }) } as Response;
    });
    const onTestRun = vi.fn();
    render(
      <I18nProvider lang="vi">
        <WorkflowEditor workflowId="wf1" fetchImpl={fetchImpl} onSaved={vi.fn()} onTestRun={onTestRun} />
      </I18nProvider>,
    );
    await waitFor(() => screen.getByDisplayValue("My WF"));
    // Make dirty so persistGraph runs (save-before-test path)
    fireEvent.change(screen.getByRole("textbox", { name: /tên workflow|workflow name/i }), {
      target: { value: "Edited" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /chạy thử/i }));
    });
    await waitFor(() => {
      const calls = fetchImpl.mock.calls as [string, RequestInit][];
      // 1) dirty graph was saved (PATCH) before running
      expect(calls.some(([, o]) => o?.method === "PATCH")).toBe(true);
      // 2) dry-run POST sent with { dryRun: true }
      const runCall = calls.find(([u]) => String(u).endsWith("/run"));
      expect(runCall).toBeDefined();
      expect(JSON.parse((runCall![1] as RequestInit).body as string)).toEqual({ dryRun: true });
    });
    // 3) runId handed to the parent for SSE tracking
    expect(onTestRun).toHaveBeenCalledWith("run-xyz");
  });
});

describe("WorkflowEditor — undo/redo toolbar", () => {
  test("undo and redo buttons render disabled at start (no history yet)", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));
    const undoBtn = screen.getByRole("button", { name: /hoàn tác|undo/i });
    const redoBtn = screen.getByRole("button", { name: /làm lại|redo/i });
    // Baseline is only seeded after the debounce; before any edit both are disabled.
    expect(undoBtn).toBeDisabled();
    expect(redoBtn).toBeDisabled();
  });
});

describe("WorkflowEditor — edge editing", () => {
  const fetchOneEdge: FetchLike = async () =>
    ({
      ok: true,
      json: async () => ({
        name: "WF",
        graph: {
          nodes: [
            { id: "n1", kind: "agent", prompt: "a" },
            { id: "n2", kind: "agent", prompt: "b" },
          ],
          edges: [{ from: "n1", to: "n2" }],
        },
      }),
    }) as Response;

  const fetchCondEdge: FetchLike = async () =>
    ({
      ok: true,
      json: async () => ({
        name: "WF",
        graph: {
          nodes: [
            { id: "c", kind: "condition", when: { left: "{{x}}", op: "eq", right: 1 } },
            { id: "n2", kind: "agent", prompt: "b" },
          ],
          edges: [{ from: "c", to: "n2", label: "true" }],
        },
      }),
    }) as Response;

  test("clicking an edge shows the toolbar; delete removes the edge", async () => {
    render(
      <I18nProvider lang="vi">
        <WorkflowEditor workflowId="wf1" fetchImpl={fetchOneEdge} onSaved={vi.fn()} />
      </I18nProvider>,
    );
    await screen.findByTestId("node-n1");
    expect(screen.getByTestId("edge-0")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("edge-0"));
    // Edge toolbar's delete button (aria/text "Xoá cạnh")
    fireEvent.click(screen.getByRole("button", { name: /xoá cạnh|delete edge/i }));
    expect(screen.queryByTestId("edge-0")).not.toBeInTheDocument();
  });

  test("condition edge can be relabeled true→false", async () => {
    render(
      <I18nProvider lang="vi">
        <WorkflowEditor workflowId="wf1" fetchImpl={fetchCondEdge} onSaved={vi.fn()} />
      </I18nProvider>,
    );
    await screen.findByTestId("node-c");
    expect(screen.getByTestId("edge-0").textContent).toBe("true");
    fireEvent.click(screen.getByTestId("edge-0"));
    // The toolbar's true/false select (only shown for condition edges)
    const select = screen.getByRole("combobox", { name: /nhãn cạnh|edge label/i });
    fireEvent.change(select, { target: { value: "false" } });
    expect(screen.getByTestId("edge-0").textContent).toBe("false");
  });
});

describe("WorkflowEditor — config panel dock mode (B)", () => {
  test("panel toggle switches right↔float and persists to localStorage", async () => {
    localStorage.clear();
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));
    // Default is "right" → the toggle offers the "float" action.
    fireEvent.click(screen.getByRole("button", { name: /tách panel|float panel/i }));
    expect(localStorage.getItem("wf-panel-mode")).toBe("float");
    // Now in "float" → the toggle offers the "dock" action; clicking returns to right.
    fireEvent.click(screen.getByRole("button", { name: /gắn panel|dock panel/i }));
    expect(localStorage.getItem("wf-panel-mode")).toBe("right");
  });
});

describe("WorkflowEditor — Tidy (auto-layout)", () => {
  test("Tidy button renders and clicking it marks the graph dirty (Save shows ●)", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));
    const tidy = screen.getByRole("button", { name: /sắp xếp|tidy/i });
    fireEvent.click(tidy);
    // Dirty indicator (●) appears on the Save button after a layout change.
    await waitFor(() => expect(screen.getByText("●")).toBeInTheDocument());
  });
});

describe("WorkflowEditor — Cmd/Ctrl+K node palette", () => {
  test("Ctrl+K opens the palette; typing filters to a matching kind; Esc closes", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const palette = await screen.findByTestId("node-palette");
    const input = within(palette).getByRole("textbox");

    // Diacritic-folded query "dieu kien" should narrow to the Condition kind only.
    fireEvent.change(input, { target: { value: "dieu kien" } });
    expect(within(palette).getByText("Điều kiện")).toBeInTheDocument();
    expect(within(palette).queryByText("Agent")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("node-palette")).not.toBeInTheDocument();
  });

  test("picking a kind from the palette appends a node", async () => {
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));
    const before = parseInt(screen.getByTestId("node-count").textContent ?? "0");

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const palette = await screen.findByTestId("node-palette");
    fireEvent.click(within(palette).getByText("Connector"));

    const after = parseInt(screen.getByTestId("node-count").textContent ?? "0");
    expect(after).toBe(before + 1);
  });
});

describe("WorkflowEditor — authoring-time validation surfacing", () => {
  test("a collected issue shows a node badge AND a clickable issues panel (advisory)", async () => {
    mockCollectIssues.mockReturnValue([{ nodeId: "n1", code: "orphan", severity: "error" }]);
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));

    // Per-node advisory badge on the offending node card.
    expect(screen.getByTestId("node-issue-badge")).toBeInTheDocument();
    // Aggregate issues panel with the localized message and count.
    expect(screen.getByText(/Vấn đề \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/chưa nối vào luồng/i)).toBeInTheDocument();
  });
});

describe("WorkflowEditor — per-node run output popover", () => {
  function renderWithOutputs(nodeOutputs: Record<string, { outputPreview?: string; error?: string }>, nodeStatuses: Record<string, "idle" | "running" | "success" | "error">) {
    return render(
      <I18nProvider lang="vi">
        <WorkflowEditor
          workflowId="wf1"
          fetchImpl={buildFetch({ name: "My WF", graph: starterGraph })}
          onSaved={vi.fn()}
          nodeStatuses={nodeStatuses}
          nodeOutputs={nodeOutputs}
        />
      </I18nProvider>,
    );
  }

  test("selecting a node with run output shows its (code-derived) preview", async () => {
    renderWithOutputs({ n1: { outputPreview: "ket qua: 42" } }, { n1: "success" });
    await waitFor(() => screen.getByDisplayValue("My WF"));
    fireEvent.click(screen.getByTestId("node-n1")); // select the node
    expect(await screen.findByTestId("node-output-popover")).toHaveTextContent("ket qua: 42");
  });

  test("a failed node's popover shows the error message", async () => {
    renderWithOutputs({ n1: { error: "Ollama 500" } }, { n1: "error" });
    await waitFor(() => screen.getByDisplayValue("My WF"));
    fireEvent.click(screen.getByTestId("node-n1"));
    expect(await screen.findByTestId("node-output-popover")).toHaveTextContent("Ollama 500");
  });

  test("no popover when the node has no run output/error", async () => {
    renderWithOutputs({}, {});
    await waitFor(() => screen.getByDisplayValue("My WF"));
    fireEvent.click(screen.getByTestId("node-n1"));
    expect(screen.queryByTestId("node-output-popover")).not.toBeInTheDocument();
  });
});

describe("WorkflowEditor — node I/O badge + auto-pan", () => {
  test("I/O badge shows the {{steps.<id>.output}} ref and copies it on click", async () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } }); // jsdom has no clipboard
    renderEditor();
    await waitFor(() => screen.getByDisplayValue("My WF"));
    const badge = await screen.findByTestId("node-io-badge");
    expect(badge.getAttribute("aria-label")).toContain("{{steps.n1.output}}");
    fireEvent.click(badge);
    expect(writeText).toHaveBeenCalledWith("{{steps.n1.output}}");
  });

  test("auto-pans the canvas to a node when it starts running", async () => {
    panCalls.length = 0;
    render(
      <I18nProvider lang="vi">
        <WorkflowEditor
          workflowId="wf1"
          fetchImpl={buildFetch({ name: "My WF", graph: starterGraph })}
          onSaved={vi.fn()}
          nodeStatuses={{ n1: "running" }}
        />
      </I18nProvider>,
    );
    await waitFor(() => screen.getByDisplayValue("My WF"));
    await waitFor(() => expect(panCalls.length).toBeGreaterThan(0));
    expect(panCalls[0]).toEqual([0, 0]); // n1 is the first node → flow position (0,0)
  });
});
