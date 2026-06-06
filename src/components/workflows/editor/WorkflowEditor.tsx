"use client";

/**
 * WorkflowEditor — React Flow canvas for building/editing workflow graphs.
 *
 * Canvas interactions (drag to position, connect via handle drag) are provided
 * by React Flow built-ins and FLAGGED FOR LIVE QA — cannot be tested in jsdom.
 *
 * Tested behavior (see WorkflowEditor.test.tsx):
 *   - palette add appends a node to state
 *   - save handler: fromReactFlow → assertRunnable → PATCH → toast/error
 */

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  Handle,
  Position,
} from "@xyflow/react";
import type { Node as RFNode, Edge as RFEdge, Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./workflow-editor.css";

import { toReactFlow, fromReactFlow } from "./graph-serde";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { assertRunnable } from "@/lib/workflow/validate";
import { useT } from "@/i18n/provider";
import { workflows as dict } from "@/i18n/dictionaries/workflows";
import type { WfNode, WfNodeKind } from "@/lib/workflow/types";

// ── Custom node renderer ────────────────────────────────────────────────────

const KIND_COLORS: Record<WfNodeKind, string> = {
  agent: "#2563eb",
  connector: "#7c3aed",
  condition: "#d97706",
  foreach: "#16a34a",
};

// Data-mutating RF change types — 'select' and 'dimensions' are view-only
// and must NOT mark the graph dirty. Defined at module level (not inside the
// component) to avoid re-allocating the Set on every render.
const DATA_CHANGE_TYPES = new Set(["position", "remove", "add", "replace"] as const);

// RF NodeProps data is Record<string, unknown>; we cast to extract our payload.
function WfNodeCard({ data, selected }: { data: Record<string, unknown>; selected?: boolean }) {
  const wf = (data as { node: WfNode }).node;
  const color = KIND_COLORS[wf.kind] ?? "#64748b";
  const label =
    wf.kind === "agent"
      ? wf.prompt.slice(0, 32) + (wf.prompt.length > 32 ? "…" : "")
      : wf.kind === "connector"
        ? `${wf.connectorId}.${wf.action}`
        : wf.kind === "condition"
          ? "condition"
          : `foreach(${wf.items.slice(0, 20)})`;

  return (
    <div
      style={{
        background: "var(--wf-node-bg)",
        // Per-side longhand only (no `border` shorthand) so the accent left border
        // doesn't conflict with the shorthand on rerender — React 19 warns when
        // mixing `border` + `borderLeft` while a value updates (selected toggle).
        borderStyle: "solid",
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderLeftWidth: 4,
        borderTopColor: selected ? color : "var(--wf-node-border)",
        borderRightColor: selected ? color : "var(--wf-node-border)",
        borderBottomColor: selected ? color : "var(--wf-node-border)",
        borderLeftColor: color,
        borderRadius: 10,
        padding: "8px 12px",
        minWidth: 160,
        maxWidth: 220,
        boxShadow: selected ? `0 0 0 2px ${color}33` : "0 1px 3px rgba(0,0,0,.08)",
        fontSize: 12,
        color: "var(--wf-node-text)",
        position: "relative",
      }}
    >
      {/* Target handle — all nodes accept one incoming edge */}
      <Handle type="target" position={Position.Left} />

      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          color,
          letterSpacing: "0.05em",
          marginBottom: 2,
        }}
      >
        {wf.kind}
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>
        {label}
      </div>
      <div style={{ fontSize: 9, color: "var(--wf-node-id-text)", marginTop: 2 }}>{wf.id}</div>

      {/* Source handles — condition has two (true/false); all others have one */}
      {wf.kind === "condition" ? (
        <>
          <Handle type="source" id="true" position={Position.Right} />
          <Handle type="source" id="false" position={Position.Bottom} />
        </>
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}

// ── Default configs per kind ────────────────────────────────────────────────

function defaultNode(kind: WfNodeKind): WfNode {
  const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`;
  if (kind === "agent") return { id, kind, prompt: "" };
  if (kind === "connector") return { id, kind, connectorId: "", action: "", args: {} };
  if (kind === "condition") return { id, kind, when: { left: "", op: "eq", right: "" } };
  // foreach
  return { id, kind, items: "{{items}}", body: { nodes: [], edges: [] } };
}

// ── Palette button ──────────────────────────────────────────────────────────

function PaletteBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition"
    >
      {label}
    </button>
  );
}

// ── Main editor ─────────────────────────────────────────────────────────────

// Cast needed: RF NodeTypes expects NodeProps with Record<string,unknown> data
// but we use a narrowed data shape. The cast is safe — RF passes the same object.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_TYPES = { wf: WfNodeCard as any };

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// Use a looser fetch signature for test injection compatibility
export type FetchLike = (url: string, opts?: RequestInit) => Promise<Response>;

export interface WorkflowEditorProps {
  workflowId: string;
  /** Injected for tests — if omitted, uses fetch */
  fetchImpl?: FetchLike;
  /** Called after a successful save — if omitted, uses router.push */
  onSaved?: () => void;
}

/**
 * ReactFlowProvider must wrap the component that calls useReactFlow().
 * WorkflowEditorInner holds all the state and hooks; WorkflowEditor is the
 * exported shell that provides the RF context.
 */
export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowEditorInner({ workflowId, fetchImpl, onSaved }: WorkflowEditorProps) {
  const t = useT(dict);
  const router = useRouter();
  const rfInstance = useReactFlow();
  // fetchImpl allows test injection; default is native fetch (cast to FetchLike)
  const f: FetchLike = fetchImpl ?? ((url, opts) => fetch(url, opts));

  // Workflow metadata
  const [wfName, setWfName] = useState("");

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode<{ node: WfNode }>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);

  // Selection + config
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Condition edge label prompt: when user connects FROM a condition node
  // we need to assign a true/false label.
  const pendingEdgeLabelRef = useRef<{ edge: RFEdge; resolve: (label: string | null) => void } | null>(null);
  const [pendingEdge, setPendingEdge] = useState<RFEdge | null>(null);
  const [edgeLabelInput, setEdgeLabelInput] = useState<"true" | "false">("true");

  // Load state
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");

  // Dirty tracking — only active after initial load
  const [isDirty, setIsDirty] = useState(false);
  const loadedRef = useRef(false);

  // Load on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await f(`/api/workflows/${encodeURIComponent(workflowId)}`);
        if (!res.ok) {
          setLoadState("error");
          return;
        }
        const wf = await res.json() as { name: string; graph: import("@/lib/workflow/types").WorkflowGraph };
        setWfName(wf.name);
        const rf = toReactFlow(wf.graph);
        setNodes(rf.nodes.map((n) => ({ ...n, sourcePosition: Position.Right, targetPosition: Position.Left })));
        setEdges(rf.edges);
        setLoadState("loaded");
      } catch {
        setLoadState("error");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Activate dirty tracking once workflow is loaded
  useEffect(() => {
    if (loadState === "loaded") {
      loadedRef.current = true;
    }
  }, [loadState]);

  // ── Palette: add node ────────────────────────────────────────────────────

  const addNode = useCallback(
    (kind: WfNodeKind) => {
      const wfNode = defaultNode(kind);
      // Place new node at the current viewport center so it's always visible,
      // with a small stagger offset per existing node count to avoid exact overlap.
      const center = rfInstance.screenToFlowPosition({
        x: window.innerWidth / 2 + nodes.length * 10,
        y: window.innerHeight / 2,
      });
      const rfNode: RFNode<{ node: WfNode }> = {
        id: wfNode.id,
        type: "wf",
        position: center,
        data: { node: wfNode },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
      setNodes((prev) => [...prev, rfNode]);
      setIsDirty(true);
    },
    [nodes.length, setNodes, rfInstance],
  );

  // Wrapped change handlers — mark dirty on user-driven changes (post-load)
  const wrappedOnNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      if (loadedRef.current && changes.some((c) => DATA_CHANGE_TYPES.has(c.type as never))) {
        setIsDirty(true);
      }
    },
    [onNodesChange],
  );

  const wrappedOnEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      if (loadedRef.current && changes.some((c) => DATA_CHANGE_TYPES.has(c.type as never))) {
        setIsDirty(true);
      }
    },
    [onEdgesChange],
  );

  // ── Connect: add edge, handle condition label ────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      // Check if source is a condition node
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const wfSource = (sourceNode?.data as { node: WfNode } | undefined)?.node;

      if (wfSource?.kind === "condition") {
        // Need a label — show inline picker
        const tentativeEdge: RFEdge = {
          id: `${connection.source}->${connection.target}-pending`,
          source: connection.source ?? "",
          target: connection.target ?? "",
          label: edgeLabelInput,
        };
        setPendingEdge(tentativeEdge);
        // Store resolve callback
        pendingEdgeLabelRef.current = {
          edge: tentativeEdge,
          resolve: (label: string | null) => {
            if (label) {
              const finalEdge = { ...tentativeEdge, id: `${connection.source}->${connection.target}-${label}`, label };
              setEdges((prev) => addEdge(finalEdge, prev));
              setIsDirty(true);
            }
            setPendingEdge(null);
          },
        };
      } else {
        setEdges((prev) => addEdge({
          id: `${connection.source}->${connection.target}`,
          source: connection.source ?? "",
          target: connection.target ?? "",
        }, prev));
        setIsDirty(true);
      }
    },
    [nodes, edgeLabelInput, setEdges],
  );

  // ── Node selection ───────────────────────────────────────────────────────

  const onNodeClick = useCallback((_: React.MouseEvent, node: RFNode) => {
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  // ── Config panel onChange ────────────────────────────────────────────────

  const onNodeConfigChange = useCallback(
    (updatedNode: WfNode) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === updatedNode.id
            ? { ...n, data: { node: updatedNode } }
            : n,
        ),
      );
      setIsDirty(true);
    },
    [setNodes],
  );

  // ── Delete node ──────────────────────────────────────────────────────────

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedId(null);
      setIsDirty(true);
    },
    [setNodes, setEdges],
  );

  // ── Keyboard: Delete selected node ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    function onKeyDown(e: KeyboardEvent) {
      // Ignore when focus is inside an editable field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        handleDeleteNode(selectedId);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId, handleDeleteNode]);

  // ── Beforeunload: warn on unsaved changes ───────────────────────────────

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ── Selected node (for config panel) ────────────────────────────────────

  const selectedRfNode = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) : null),
    [selectedId, nodes],
  );
  const selectedWfNode = selectedRfNode
    ? (selectedRfNode.data as { node: WfNode }).node
    : null;

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const graph = fromReactFlow(nodes, edges);
      // Client-side preflight
      assertRunnable(graph);
      // PATCH
      const res = await f(`/api/workflows/${encodeURIComponent(workflowId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: wfName, graph }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "save failed");
      }
      setSaveStatus("saved");
      setIsDirty(false);
      if (onSaved) {
        onSaved();
      } else {
        setTimeout(() => router.push(`/workflows/${encodeURIComponent(workflowId)}`), 800);
      }
    } catch (e) {
      setSaveStatus("error");
      setSaveError(e instanceof Error ? e.message : t("wf.editor.saveErr"));
    }
  }, [nodes, edges, workflowId, wfName, f, onSaved, router, t]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loadState === "loading") {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-400">
        {t("wf.editor.loading")}
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex h-64 items-center justify-center text-red-500">
        {t("wf.editor.loadErr")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-900">
        <button
          type="button"
          onClick={() => {
            if (isDirty && !window.confirm(t("wf.editor.unsavedConfirm"))) return;
            router.push(`/workflows/${encodeURIComponent(workflowId)}`);
          }}
          className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          {t("wf.editor.backToDetail")}
        </button>
        <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />
        <input
          type="text"
          value={wfName}
          onChange={(e) => { setWfName(e.target.value); setIsDirty(true); }}
          aria-label={t("wf.editor.name")}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <div className="flex items-center gap-2">
          {/* Palette */}
          <span className="text-xs text-neutral-400">{t("wf.editor.palette")}</span>
          <PaletteBtn label={t("wf.editor.addAgent")} onClick={() => addNode("agent")} />
          <PaletteBtn label={t("wf.editor.addConnector")} onClick={() => addNode("connector")} />
          <PaletteBtn label={t("wf.editor.addCondition")} onClick={() => addNode("condition")} />
          <PaletteBtn label={t("wf.editor.addForeach")} onClick={() => addNode("foreach")} />
        </div>
        <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saveStatus === "saving"}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
        >
          {saveStatus === "saving"
            ? t("wf.editor.saving")
            : isDirty
              ? `● ${t("wf.editor.save")}`
              : t("wf.editor.save")}
        </button>
        {saveStatus === "saved" && (
          <span className="text-xs font-semibold text-green-600">{t("wf.editor.saved")}</span>
        )}
        {saveStatus === "error" && (
          <span className="text-xs text-red-500" title={saveError ?? undefined}>
            {t("wf.editor.saveErr")}
          </span>
        )}
      </div>

      {/* Validation error (client preflight) */}
      {saveError && saveStatus === "error" && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
          {saveError}
        </div>
      )}

      {/* Body: canvas + config panel */}
      <div className="flex min-h-0 flex-1">
        {/* React Flow canvas */}
        <div className="relative min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={wrappedOnNodesChange}
            onEdgesChange={wrappedOnEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            minZoom={0.2}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>

          {/* Condition edge-label picker (inline overlay) */}
          {pendingEdge && (
            <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
              <p className="mb-2 text-sm font-semibold">{t("wf.editor.condEdgeLabel")}</p>
              <div className="flex items-center gap-2">
                <select
                  value={edgeLabelInput}
                  onChange={(e) => setEdgeLabelInput(e.target.value as "true" | "false")}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
                <button
                  type="button"
                  onClick={() => pendingEdgeLabelRef.current?.resolve(edgeLabelInput)}
                  className="rounded-lg bg-[var(--color-accent)] px-3 py-1 text-sm font-semibold text-white hover:opacity-90"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => pendingEdgeLabelRef.current?.resolve(null)}
                  className="rounded-lg border border-neutral-200 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                >
                  {t("wf.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Config panel */}
        <div className="w-72 shrink-0 border-l border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          {selectedWfNode ? (
            <NodeConfigPanel
              node={selectedWfNode}
              onChange={onNodeConfigChange}
              onDelete={() => handleDeleteNode(selectedWfNode.id)}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-sm text-neutral-400">
              {t("wf.editor.noSelection")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
