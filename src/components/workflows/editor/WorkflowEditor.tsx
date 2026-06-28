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

import { useCallback, useEffect, useMemo, useState, useRef, type RefObject } from "react";
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
  MarkerType,
  NodeToolbar,
} from "@xyflow/react";
import type { Node as RFNode, Edge as RFEdge, Connection } from "@xyflow/react";
import { Copy, Trash2, Undo2, Redo2, Move, PanelRight, PanelLeft, Sparkles, ClipboardCheck, LayoutGrid, AlertTriangle, SearchCode } from "lucide-react";
import "@xyflow/react/dist/style.css";
import "./workflow-editor.css";

import { toReactFlow, fromReactFlow, capturePositions, pruneDanglingEdges } from "./graph-serde";
import { NodesLibraryPanel, NODE_KIND_MIME, NODE_TYPES as LIBRARY_NODE_TYPES, type LibraryMode } from "./NodesLibraryPanel";
import { NodePalette } from "./NodePalette";
import { AiGeneratePanel } from "./AiGeneratePanel";
import { AiReviewPanel } from "./AiReviewPanel";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { assertRunnable, collectIssues } from "@/lib/workflow/validate";
import { layoutPositions } from "./autoLayout";
import { nodeOutputRef } from "./outputRef";
import { useT } from "@/i18n/provider";
import { workflows as dict } from "@/i18n/dictionaries/workflows";
import type { WfNode, WfNodeKind, WorkflowGraph } from "@/lib/workflow/types";
import { edgeRunDecoration, type NodeRunOutput } from "./nodeStatus";
import { emptyHistory, pushSnapshot, undo, redo, canUndo, canRedo } from "./historyStack";
import type { HistoryState, Snapshot } from "./historyStack";

// ── Custom node renderer ────────────────────────────────────────────────────

// Derived from NODE_TYPES (the single source in NodesLibraryPanel) so the canvas
// card/minimap colours can never drift from the desktop library + mobile palette.
const KIND_COLORS = Object.fromEntries(
  LIBRARY_NODE_TYPES.map(({ kind, color }) => [kind, color]),
) as Record<WfNodeKind, string>;

// Data-mutating RF change types — 'select' and 'dimensions' are view-only
// and must NOT mark the graph dirty. Defined at module level (not inside the
// component) to avoid re-allocating the Set on every render.
const DATA_CHANGE_TYPES = new Set(["position", "remove", "add", "replace"] as const);

// Default options for every edge: arrow marker + consistent stroke + label bg so
// "true"/"false" condition labels don't overlap the line (fixes visual overlap on canvas).
// Defined at module level so the object reference is stable (no re-render on <ReactFlow>).
const DEFAULT_EDGE_OPTIONS = {
  style: { strokeWidth: 2, stroke: "var(--wf-edge-stroke)" },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
  labelStyle: { fontSize: 11, fill: "var(--wf-node-text)" },
  labelBgStyle: { fill: "var(--wf-node-bg)", fillOpacity: 0.92 },
  labelBgPadding: [4, 2] as [number, number],
  labelBgBorderRadius: 4,
};

// Data signature for undo/redo dedup — only persistent fields (ignores selection,
// dimensions, sub-pixel drag jitter) so view-only changes don't create snapshots.
function dataSig(nodes: RFNode[], edges: RFEdge[]): string {
  return JSON.stringify({
    n: nodes.map((n) => ({
      id: n.id,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      d: (n.data as { node: WfNode }).node,
    })),
    e: edges.map((e) => ({ id: e.id, s: e.source, t: e.target, l: e.label })),
  });
}

// Actions passed to every node card via a stable ref — avoids re-render churn
// that would occur if callbacks were placed directly in `data`.
type NodeActions = {
  delete: (nodeId: string) => void;
  copy: (nodeId: string) => void;
};

type WfNodeData = {
  node: WfNode;
  actionsRef: RefObject<NodeActions>;
  /** Node run status — set by WorkflowEditorInner when a run is active */
  status?: "idle" | "running" | "success" | "error";
  /** Localized authoring-time validation messages for this node (advisory). */
  issues?: string[];
  /** Last run output/error preview for this node (per-node popover when selected). */
  output?: NodeRunOutput;
};

// RF NodeProps data is Record<string, unknown>; we cast to extract our payload.
function WfNodeCard({ data, selected }: { data: Record<string, unknown>; selected?: boolean }) {
  const t = useT(dict);
  const { node: wf, status, actionsRef, issues, output } = data as WfNodeData;
  const hasIssues = !!issues?.length && (!status || status === "idle");
  const showOutput = !!selected && !!(output?.outputPreview || output?.error);
  const ioRef = nodeOutputRef(wf); // {{steps.<id>.output}} — copy-able I/O badge
  const color = KIND_COLORS[wf.kind] ?? "#64748b";
  const label =
    wf.kind === "agent"
      ? wf.prompt.slice(0, 32) + (wf.prompt.length > 32 ? "…" : "")
      : wf.kind === "connector"
        ? `${wf.connectorId}.${wf.action}`
        : wf.kind === "condition"
          ? "condition"
          : wf.kind === "mcp"
            ? `${wf.server}.${wf.tool}`
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
      {/* Node toolbar — visible when selected, shows copy + delete */}
      <NodeToolbar isVisible={selected ?? false} position={Position.Top} style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          title="Copy node"
          aria-label="Copy node"
          className="wf-toolbar-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); actionsRef?.current.copy(wf.id); }}
        >
          <Copy size={12} />
        </button>
        <button
          type="button"
          title="Delete node"
          aria-label="Delete node"
          data-testid="toolbar-delete"
          className="wf-toolbar-btn danger"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); actionsRef?.current.delete(wf.id); }}
        >
          <Trash2 size={12} />
        </button>
      </NodeToolbar>
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

      {/* I/O badge — the {{steps.<id>.output}} reference, click to copy. Makes data
          flow legible without opening the config panel (open-agent-builder pattern). */}
      {ioRef && (
        <button
          type="button"
          data-testid="node-io-badge"
          className="nodrag"
          title={t("wf.node.copyOutputRef", { ref: ioRef })}
          aria-label={t("wf.node.copyOutputRef", { ref: ioRef })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard?.writeText(ioRef);
          }}
          style={{
            marginTop: 4,
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            borderRadius: 6,
            padding: "1px 6px",
            fontFamily: "monospace",
            fontSize: 9,
            color: "var(--color-accent)",
            background: "var(--accent-muted)",
            border: "1px solid transparent",
            cursor: "copy",
          }}
        >
          <Copy size={9} aria-hidden /> output
        </button>
      )}

      {/* Source handles — condition has two (true/false); all others have one */}
      {wf.kind === "condition" ? (
        <>
          <Handle type="source" id="true" position={Position.Right} />
          <Handle type="source" id="false" position={Position.Bottom} />
        </>
      ) : (
        <Handle type="source" position={Position.Right} />
      )}

      {/* Run status badge — shown when editor has an active run (P5-C) */}
      {status && status !== "idle" && (
        <div
          style={{
            position: "absolute",
            top: -8,
            right: -8,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background:
              status === "running" ? "#3b82f6" :
              status === "success" ? "#22c55e" :
              "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            color: "#fff",
            fontWeight: 700,
          }}
        >
          {status === "running" ? "…" : status === "success" ? "✓" : "✕"}
        </div>
      )}

      {/* Authoring-time validation badge — advisory only (never blocks save). */}
      {hasIssues && (
        <div
          data-testid="node-issue-badge"
          title={issues!.join("\n")}
          aria-label={issues!.join("; ")}
          style={{
            position: "absolute",
            top: -8,
            left: -8,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: "#fff",
            fontWeight: 700,
          }}
        >
          !
        </div>
      )}

      {/* Per-node run output / error popover — shown when the node is selected and
          its last run produced output or failed. Output is code-derived + bounded. */}
      {showOutput && (
        <div
          data-testid="node-output-popover"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            width: 240,
            maxHeight: 140,
            overflowY: "auto",
            zIndex: 20,
            borderRadius: 8,
            padding: "6px 8px",
            fontSize: 11,
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: output?.error ? "#fef2f2" : "var(--wf-node-bg)",
            color: output?.error ? "#b91c1c" : "var(--wf-node-text)",
            border: `1px solid ${output?.error ? "#fecaca" : "var(--wf-node-border)"}`,
            boxShadow: "0 4px 12px rgba(0,0,0,.12)",
          }}
        >
          {output?.error ? output.error : output?.outputPreview}
        </div>
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
  if (kind === "mcp") return { id, kind, server: "", tool: "", args: {} };
  // foreach
  return { id, kind: "foreach", items: "{{items}}", body: { nodes: [], edges: [] } };
}

// ── Palette button ──────────────────────────────────────────────────────────

function PaletteBtn({ label, icon, onClick }: { label: string; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition"
    >
      {icon}
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
  /**
   * Node run statuses from an active workflow run.
   * Key = node id. Used to show status badges on nodes (P5-C run-in-editor).
   */
  nodeStatuses?: Record<string, "idle" | "running" | "success" | "error">;
  /** Per-node run output/error previews (from the SSE step frame) — drives the popover. */
  nodeOutputs?: Record<string, NodeRunOutput>;
  /** Called with the runId after a Test (dry-run) is triggered — parent tracks it via SSE. */
  onTestRun?: (runId: string) => void;
  /** Overall run status from the parent's useWorkflowEvents — drives edge flow animation. */
  runStatus?: string | null;
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

function WorkflowEditorInner({ workflowId, fetchImpl, onSaved, nodeStatuses, nodeOutputs, onTestRun, runStatus }: WorkflowEditorProps) {
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

  // Mobile bottom-sheet animation (H): mounted in DOM vs visually open, plus the
  // node to show — `sheetNode` is retained during the close slide-down after deselect.
  const [sheetMounted, setSheetMounted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetNode, setSheetNode] = useState<WfNode | null>(null);

  // Edge editing: id of the currently selected edge (drives the edge toolbar).
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Test (dry-run) in progress
  const [testing, setTesting] = useState(false);
  // Cmd/Ctrl+K quick-add node palette
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  // Undo/redo (F): pure stack in a ref; flags in state drive the toolbar buttons.
  // restoringRef suppresses the snapshot effect while we apply an undo/redo.
  const historyRef = useRef<HistoryState>(emptyHistory());
  const restoringRef = useRef(false);
  const [histFlags, setHistFlags] = useState({ undo: false, redo: false });

  // Config panel dock mode (B): "right" (docked) | "float" (draggable overlay).
  // Desktop only — mobile always uses the bottom sheet. Persisted to localStorage.
  const [panelMode, setPanelMode] = useState<"right" | "float">("right");
  // Nodes Library panel (desktop): docked-left | float | hidden.
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("docked");
  const [libFloatPos, setLibFloatPos] = useState({ x: 16, y: 96 });
  const [aiOpen, setAiOpen] = useState(false); // #3 — AI generate-from-prompt modal
  const [reviewOpen, setReviewOpen] = useState(false); // #3 stretch — AI review modal
  const [floatPos, setFloatPos] = useState({ x: 24, y: 24 });

  // Stable ref holding the latest delete/copy callbacks.
  // Using a ref instead of putting callbacks in node data prevents full-tree
  // re-renders whenever handleDeleteNode or handleCopyNode are recreated.
  const nodeActionsRef = useRef<NodeActions>({
    delete: () => {},
    copy: () => {},
  });

  // Authoring-time validation: recompute structured issues whenever the graph
  // changes, localize each code, and attribute foreach-body faults to their
  // top-level foreach node. Advisory only — Save/Test still gate via assertRunnable.
  const { issuesByNode, graphIssues } = useMemo(() => {
    const list = collectIssues(fromReactFlow(nodes, edges));
    const byNode = new Map<string, string[]>();
    const top: string[] = [];
    for (const iss of list) {
      const msg = t(`wf.validate.${iss.code}`);
      if (iss.nodeId) {
        const topId = iss.nodeId.split("/")[0];
        const arr = byNode.get(topId) ?? [];
        arr.push(iss.nodeId === topId ? msg : `${msg} (${iss.nodeId})`);
        byNode.set(topId, arr);
      } else {
        top.push(msg);
      }
    }
    return { issuesByNode: byNode, graphIssues: top };
  }, [nodes, edges, t]);

  const issueCount = graphIssues.length + [...issuesByNode.values()].reduce((s, a) => s + a.length, 0);

  // Merge external nodeStatuses + validation issues into RF node data so WfNodeCard
  // can render its status and issue badges.
  const nodesWithStatus = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          actionsRef: nodeActionsRef,
          status: nodeStatuses?.[n.id] ?? "idle",
          issues: issuesByNode.get(n.id),
          output: nodeOutputs?.[n.id],
        } satisfies WfNodeData,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, nodeStatuses, nodeOutputs, issuesByNode],
  );

  // Auto-pan: smoothly recenter the canvas on the node that just started running so
  // the user follows execution live (open-agent-builder UX). Only on a new running
  // node — never fights manual panning between transitions.
  const lastPannedRef = useRef<string | null>(null);
  useEffect(() => {
    const running = nodeStatuses && Object.keys(nodeStatuses).find((id) => nodeStatuses[id] === "running");
    if (!running) {
      if (!nodeStatuses || Object.keys(nodeStatuses).length === 0) lastPannedRef.current = null; // reset between runs
      return;
    }
    if (running === lastPannedRef.current) return;
    const rf = nodes.find((n) => n.id === running);
    if (!rf) return;
    lastPannedRef.current = running;
    try {
      rfInstance.setCenter(rf.position.x, rf.position.y, { zoom: 1, duration: 400 });
    } catch {
      /* no viewport yet */
    }
  }, [nodeStatuses, nodes, rfInstance]);

  // Decorate edges with run status: animate flow while running, redden on source error.
  // Pure derivation (edgeRunDecoration) is unit-tested; the visuals are verified via E2E.
  const edgesWithStatus = useMemo(
    () =>
      edges.map((e) => {
        const { animated, errored } = edgeRunDecoration(nodeStatuses?.[e.source] ?? "idle", runStatus);
        const selected = e.id === selectedEdgeId;
        if (!animated && !errored && !selected) return e; // unchanged → keep stable reference
        const stroke = errored ? "#ef4444" : selected ? "var(--color-accent)" : "var(--wf-edge-stroke)";
        return {
          ...e,
          animated,
          style: {
            ...(e.style ?? {}),
            strokeWidth: errored || selected ? 2.5 : 2,
            stroke,
          },
          ...(errored ? { markerEnd: { type: MarkerType.ArrowClosed, color: "#ef4444", width: 18, height: 18 } } : {}),
        };
      }),
    [edges, nodeStatuses, runStatus, selectedEdgeId],
  );

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
        // Defensive: drop edges to nodes that no longer exist before rendering.
        const rf = toReactFlow(pruneDanglingEdges(wf.graph));
        setNodes(rf.nodes.map((n) => ({ ...n, sourcePosition: Position.Right, targetPosition: Position.Left })));
        setEdges(rf.edges.map((e) => ({ ...DEFAULT_EDGE_OPTIONS, ...e })));
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
    (kind: WfNodeKind, position?: { x: number; y: number }) => {
      const wfNode = defaultNode(kind);
      // Drag-drop supplies a drop position; click-to-add falls back to the viewport
      // center (staggered per node count so click-added nodes don't stack exactly).
      const pos =
        position ??
        rfInstance.screenToFlowPosition({
          x: window.innerWidth / 2 + nodes.length * 10,
          y: window.innerHeight / 2,
        });
      const rfNode: RFNode<{ node: WfNode }> = {
        id: wfNode.id,
        type: "wf",
        position: pos,
        data: { node: wfNode },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
      setNodes((prev) => [...prev, rfNode]);
      setIsDirty(true);
    },
    [nodes.length, setNodes, rfInstance],
  );

  // ── Tidy: auto-layout the canvas (explicit action only) ──────────────────
  // Re-positions every node into a left→right layered tree (pure layoutPositions),
  // sets dirty (the debounced snapshot effect records it so Undo reverts), and
  // re-fits the viewport. Never auto-runs, so hand-placed positions are safe.
  const handleTidy = useCallback(() => {
    const pos = layoutPositions(
      nodes.map((n) => ({ id: n.id })),
      edges.map((e) => ({ from: e.source, to: e.target })),
    );
    setNodes((prev) => prev.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)));
    setIsDirty(true);
    requestAnimationFrame(() => {
      try { rfInstance.fitView({ padding: 0.2, duration: 300 }); } catch { /* no viewport yet */ }
    });
  }, [nodes, edges, setNodes, rfInstance]);

  // Drag-to-add from the Nodes Library: drop a node kind onto the canvas at the cursor.
  const onCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(NODE_KIND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);
  const onCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      const kind = e.dataTransfer.getData(NODE_KIND_MIME) as WfNodeKind;
      if (!kind) return;
      e.preventDefault();
      addNode(kind, rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [addNode, rfInstance],
  );

  // #3: load an AI-generated graph as an UNDOABLE proposal — snapshot the current canvas
  // to history first (so Undo reverts the replacement), then swap nodes/edges + fit view.
  const applyGeneratedGraph = useCallback(
    (graph: WorkflowGraph) => {
      historyRef.current = pushSnapshot(historyRef.current, { nodes, edges, sig: dataSig(nodes, edges) });
      const rf = toReactFlow(graph);
      setNodes(rf.nodes.map((n) => ({ ...n, sourcePosition: Position.Right, targetPosition: Position.Left })));
      setEdges(rf.edges.map((e) => ({ ...DEFAULT_EDGE_OPTIONS, ...e })));
      setIsDirty(true);
      requestAnimationFrame(() => {
        try { rfInstance.fitView({ padding: 0.2, duration: 300 }); } catch { /* no viewport yet */ }
      });
    },
    [nodes, edges, setNodes, setEdges, rfInstance],
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
          ...DEFAULT_EDGE_OPTIONS,
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
        setEdges((prev) =>
          addEdge(
            {
              id: `${connection.source}->${connection.target}`,
              source: connection.source ?? "",
              target: connection.target ?? "",
              ...DEFAULT_EDGE_OPTIONS,
            },
            prev,
          ),
        );
        setIsDirty(true);
      }
    },
    [nodes, edgeLabelInput, setEdges],
  );

  // ── Node selection ───────────────────────────────────────────────────────

  const onNodeClick = useCallback((_: React.MouseEvent, node: RFNode) => {
    setSelectedId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
    setSelectedEdgeId(null);
  }, []);

  // ── Edge editing: select / delete / relabel (condition true·false) ─────────
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: RFEdge) => {
    setSelectedEdgeId(edge.id);
    setSelectedId(null);
  }, []);

  const deleteEdge = useCallback(
    (id: string) => {
      setEdges((prev) => prev.filter((e) => e.id !== id));
      setSelectedEdgeId(null);
      setIsDirty(true);
    },
    [setEdges],
  );

  const relabelEdge = useCallback(
    (id: string, label: string) => {
      setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, label } : e)));
      setIsDirty(true);
    },
    [setEdges],
  );

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

  // ── Copy node ────────────────────────────────────────────────────────────

  const handleCopyNode = useCallback(
    (nodeId: string) => {
      const source = nodes.find((n) => n.id === nodeId);
      if (!source) return;
      const sourceWf = (source.data as { node: WfNode }).node;
      const newId = `${sourceWf.kind}-${crypto.randomUUID().slice(0, 8)}`;
      const newWf: WfNode = { ...sourceWf, id: newId };
      const newRfNode: RFNode<{ node: WfNode }> = {
        id: newId,
        type: "wf",
        position: { x: source.position.x + 32, y: source.position.y + 32 },
        data: { node: newWf },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
      setNodes((prev) => [...prev, newRfNode]);
      setIsDirty(true);
    },
    [nodes, setNodes],
  );

  // Keep nodeActionsRef current — WfNodeCard reads these on click.
  nodeActionsRef.current.delete = handleDeleteNode;
  nodeActionsRef.current.copy = handleCopyNode;

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

  // Selected edge (for the edge toolbar). Condition edges carry a "true"/"false" label.
  const selectedEdge = selectedEdgeId ? (edges.find((e) => e.id === selectedEdgeId) ?? null) : null;

  // All graph nodes (WfNode shape) — passed to NodeConfigPanel for {{variable}} hints.
  const allWfNodes = useMemo(() => nodes.map((n) => (n.data as { node: WfNode }).node), [nodes]);

  // ── Mobile sheet open/close animation (H) ────────────────────────────────
  // Mount immediately on select, then flip `open` next frame so the closed
  // (translate-y-full) state paints first and the slide-up transitions. On
  // deselect, slide down; `onTransitionEnd` unmounts. `sheetNode` keeps the last
  // node visible during the close animation.
  useEffect(() => {
    if (selectedWfNode) {
      setSheetNode(selectedWfNode);
      setSheetMounted(true);
      const raf = requestAnimationFrame(() => setSheetOpen(true));
      return () => cancelAnimationFrame(raf);
    }
    setSheetOpen(false);
    // Reliable unmount via timeout — onTransitionEnd can fail to fire, leaving the
    // scrim mounted and (even at opacity-0) capturing clicks across the whole screen.
    const t = setTimeout(() => setSheetMounted(false), 320);
    return () => clearTimeout(t);
  }, [selectedWfNode]);

  // ── Save ─────────────────────────────────────────────────────────────────

  // Persist the CURRENT editor graph (preflight + PATCH). Shared by Save and Test.
  // Throws on invalid graph or non-ok PATCH; no navigation / status side-effects.
  const persistGraph = useCallback(async () => {
    const graph = fromReactFlow(nodes, edges);
    assertRunnable(graph); // client preflight — throws on invalid
    // Persist canvas positions so node layout round-trips through save (#5).
    graph.positions = capturePositions(nodes);
    const res = await f(`/api/workflows/${encodeURIComponent(workflowId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: wfName, graph }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? "save failed");
    }
  }, [nodes, edges, workflowId, wfName, f]);

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await persistGraph();
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
  }, [persistGraph, onSaved, router, t, workflowId]);

  // Test (dry-run): persist current graph if dirty, then POST a dry-run; hand the
  // runId to the parent (WorkflowEditorLive) which tracks it via SSE → nodeStatuses.
  const handleTest = useCallback(async () => {
    setTesting(true);
    setSaveError(null);
    try {
      if (isDirty) {
        await persistGraph();
        setIsDirty(false);
      }
      const res = await f(`/api/workflows/${encodeURIComponent(workflowId)}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "run failed");
      }
      const body = await res.json() as { run?: { id?: string } };
      if (body.run?.id) onTestRun?.(body.run.id);
    } catch (e) {
      setSaveStatus("error");
      setSaveError(e instanceof Error ? e.message : t("wf.editor.saveErr"));
    } finally {
      setTesting(false);
    }
  }, [persistGraph, isDirty, f, workflowId, onTestRun, t]);

  // ── Undo/redo (F) ─────────────────────────────────────────────────────────
  // Debounced snapshot on data changes: 400ms coalesces drag/typing bursts; the
  // sig dedup skips selection/dimension-only changes; restoringRef skips our own
  // restores. Seeds the baseline on the first run after load.
  useEffect(() => {
    if (loadState !== "loaded") return;
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    const id = setTimeout(() => {
      const next = pushSnapshot(historyRef.current, { nodes, edges, sig: dataSig(nodes, edges) });
      if (next === historyRef.current) return; // deduped → nothing changed
      historyRef.current = next;
      setHistFlags({ undo: canUndo(next), redo: canRedo(next) });
    }, 400);
    return () => clearTimeout(id);
  }, [nodes, edges, loadState]);

  const applySnapshot = useCallback(
    (snap: Snapshot | null) => {
      if (!snap) return;
      restoringRef.current = true; // suppress the snapshot effect for this restore
      setNodes(snap.nodes as RFNode<{ node: WfNode }>[]);
      setEdges(snap.edges as RFEdge[]);
      setSelectedId(null);
      setIsDirty(true);
    },
    [setNodes, setEdges],
  );

  const undoEdit = useCallback(() => {
    const { history, snapshot } = undo(historyRef.current);
    historyRef.current = history;
    setHistFlags({ undo: canUndo(history), redo: canRedo(history) });
    applySnapshot(snapshot);
  }, [applySnapshot]);

  const redoEdit = useCallback(() => {
    const { history, snapshot } = redo(historyRef.current);
    historyRef.current = history;
    setHistFlags({ undo: canUndo(history), redo: canRedo(history) });
    applySnapshot(snapshot);
  }, [applySnapshot]);

  // Keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo (ignored inside form fields).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redoEdit();
      else undoEdit();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undoEdit, redoEdit]);

  // Keyboard: Cmd/Ctrl+K opens the quick-add node palette (intentional chord —
  // works regardless of focus). Esc-to-close is handled inside NodePalette.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Config panel dock mode (B) ────────────────────────────────────────────
  useEffect(() => {
    try {
      const m = localStorage.getItem("wf-panel-mode");
      if (m === "float" || m === "right") setPanelMode(m);
    } catch { /* SSR / disabled storage → keep default */ }
  }, []);

  // Nodes Library layout — restore the last choice (docked/float/hidden).
  useEffect(() => {
    try {
      const m = localStorage.getItem("wf-lib-mode");
      if (m === "docked" || m === "float" || m === "hidden") setLibraryMode(m);
    } catch { /* SSR / disabled storage → keep default */ }
  }, []);

  const setPanelModePersist = useCallback((m: "right" | "float") => {
    setPanelMode(m);
    try { localStorage.setItem("wf-panel-mode", m); } catch { /* ignore */ }
  }, []);

  // Drag the floating panel by its header (delta tracking on document).
  const startFloatDrag = useCallback(
    (e: React.MouseEvent) => {
      const startX = e.clientX;
      const startY = e.clientY;
      const ox = floatPos.x;
      const oy = floatPos.y;
      const onMove = (ev: MouseEvent) =>
        setFloatPos({ x: Math.max(0, ox + ev.clientX - startX), y: Math.max(0, oy + ev.clientY - startY) });
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [floatPos],
  );

  const setLibraryModePersist = useCallback((m: LibraryMode) => {
    setLibraryMode(m);
    try { localStorage.setItem("wf-lib-mode", m); } catch { /* ignore */ }
  }, []);

  // Drag the floating Nodes Library by its header (delta tracking on document).
  const startLibFloatDrag = useCallback(
    (e: React.MouseEvent) => {
      const startX = e.clientX, startY = e.clientY, ox = libFloatPos.x, oy = libFloatPos.y;
      const onMove = (ev: MouseEvent) =>
        setLibFloatPos({ x: Math.max(0, ox + ev.clientX - startX), y: Math.max(0, oy + ev.clientY - startY) });
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [libFloatPos],
  );

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
      {/* Top bar — two rows: (1) back+name+save, (2) palette scrollable on mobile */}
      <div className="border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        {/* Row 1 */}
        <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
          <button
            type="button"
            onClick={() => {
              if (isDirty && !window.confirm(t("wf.editor.unsavedConfirm"))) return;
              router.push(`/workflows/${encodeURIComponent(workflowId)}`);
            }}
            className="shrink-0 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            {t("wf.editor.backToDetail")}
          </button>
          <div className="h-4 w-px shrink-0 bg-neutral-200 dark:bg-neutral-700" />
          <button
            type="button"
            onClick={undoEdit}
            disabled={!histFlags.undo}
            aria-label={t("wf.editor.undo")}
            title={t("wf.editor.undo")}
            className="shrink-0 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <Undo2 size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={redoEdit}
            disabled={!histFlags.redo}
            aria-label={t("wf.editor.redo")}
            title={t("wf.editor.redo")}
            className="shrink-0 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <Redo2 size={16} aria-hidden />
          </button>
          {/* Tidy (auto-layout) + quick-add palette */}
          <button
            type="button"
            onClick={handleTidy}
            disabled={nodes.length === 0}
            aria-label={t("wf.editor.tidy")}
            title={t("wf.editor.tidyHint")}
            className="shrink-0 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <LayoutGrid size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={t("wf.palette.open")}
            title={t("wf.palette.open")}
            className="hidden shrink-0 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 md:inline-flex dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <SearchCode size={16} aria-hidden />
          </button>
          {/* View-controls cluster: Nodes Library toggle + config-panel dock/float */}
          <button
            type="button"
            onClick={() => setLibraryModePersist(libraryMode === "hidden" ? "docked" : "hidden")}
            aria-label={libraryMode === "hidden" ? t("wf.lib.show") : t("wf.lib.hide")}
            title={libraryMode === "hidden" ? t("wf.lib.show") : t("wf.lib.hide")}
            className="hidden shrink-0 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 md:inline-flex dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <PanelLeft size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPanelModePersist(panelMode === "right" ? "float" : "right")}
            aria-label={panelMode === "right" ? t("wf.editor.panelFloat") : t("wf.editor.panelDock")}
            title={panelMode === "right" ? t("wf.editor.panelFloat") : t("wf.editor.panelDock")}
            className="hidden shrink-0 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 md:inline-flex dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            {panelMode === "right" ? <Move size={16} aria-hidden /> : <PanelRight size={16} aria-hidden />}
          </button>
          <div className="h-4 w-px shrink-0 bg-neutral-200 dark:bg-neutral-700" />
          <input
            type="text"
            value={wfName}
            onChange={(e) => { setWfName(e.target.value); setIsDirty(true); }}
            aria-label={t("wf.editor.name")}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            title={t("wf.ai.title")}
            aria-label={t("wf.ai.button")}
            className="shrink-0 rounded-lg border border-[var(--color-accent)]/40 px-2.5 py-1.5 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
          >
            ✨ <span className="hidden sm:inline">{t("wf.ai.button")}</span>
          </button>
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            title={t("wf.ai.reviewTitle")}
            aria-label={t("wf.ai.review")}
            className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm font-semibold text-neutral-600 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] dark:border-neutral-700 dark:text-neutral-300"
          >
            <ClipboardCheck size={14} className="-mt-0.5 mr-1 inline" aria-hidden /> <span className="hidden sm:inline">{t("wf.ai.review")}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || saveStatus === "saving"}
            title={t("wf.editor.testHint")}
            aria-label={testing ? t("wf.editor.testing") : t("wf.editor.test")}
            className="shrink-0 rounded-lg border border-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-[var(--color-accent)] transition hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] disabled:opacity-50"
          >
            {testing ? (
              <span className="hidden sm:inline">{t("wf.editor.testing")}</span>
            ) : (
              <>▶ <span className="hidden sm:inline">{t("wf.editor.test")}</span></>
            )}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saveStatus === "saving"}
            aria-label={saveStatus === "saving" ? t("wf.editor.saving") : t("wf.editor.save")}
            className="shrink-0 rounded-lg bg-[var(--accent-fill)] px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saveStatus === "saving" ? (
              <span className="hidden sm:inline">{t("wf.editor.saving")}</span>
            ) : isDirty ? (
              <>● <span className="hidden sm:inline">{t("wf.editor.save")}</span></>
            ) : (
              <span className="hidden sm:inline">{t("wf.editor.save")}</span>
            )}
          </button>
          {saveStatus === "saved" && (
            <span className="hidden shrink-0 text-xs font-semibold text-green-600 sm:inline">
              {t("wf.editor.saved")}
            </span>
          )}
        </div>
        {/* Row 2: palette — MOBILE ONLY (desktop uses the left Nodes Library panel).
            P4 parity: derive từ NODE_TYPES — node kind mới tự xuất hiện cả 2 nơi. */}
        <div
          data-testid="mobile-palette"
          className="flex items-center gap-2 overflow-x-auto border-t border-neutral-100 px-3 pb-2 pt-1.5 md:hidden dark:border-neutral-800"
        >
          <span className="shrink-0 text-xs text-neutral-400">{t("wf.editor.palette")}</span>
          {LIBRARY_NODE_TYPES.map(({ kind, Icon, color }) => (
            <PaletteBtn
              key={kind}
              icon={<Icon size={13} style={{ color }} aria-hidden />}
              label={t(`wf.lib.${kind}.name`)}
              onClick={() => addNode(kind)}
            />
          ))}
        </div>
      </div>

      {/* Save / validation error banner */}
      {saveError && saveStatus === "error" && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
          <span className="font-semibold">{t("wf.editor.saveErr")}</span>
          {saveError !== t("wf.editor.saveErr") ? `: ${saveError}` : ""}
        </div>
      )}

      {/* Authoring-time issues — advisory (does NOT block Save/Test); click a row
          to jump to the offending node. assertRunnable stays the hard save gate. */}
      {issueCount > 0 && (
        <details className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold">
            <AlertTriangle size={13} aria-hidden />
            {t("wf.issues.title")} ({issueCount})
          </summary>
          <ul className="mt-1.5 space-y-1">
            {[...issuesByNode.entries()].flatMap(([nodeId, msgs]) =>
              msgs.map((msg, i) => (
                <li key={`${nodeId}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(nodeId)}
                    className="text-left underline-offset-2 hover:underline"
                  >
                    {msg} <span className="opacity-60">— {t("wf.issues.atNode")} {nodeId}</span>
                  </button>
                </li>
              )),
            )}
            {graphIssues.map((msg, i) => (
              <li key={`g-${i}`}>{msg}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Cmd/Ctrl+K quick-add node palette */}
      {paletteOpen && (
        <NodePalette t={t} onPick={(kind) => addNode(kind)} onClose={() => setPaletteOpen(false)} />
      )}

      {/* Body: nodes library + canvas + config panel */}
      <div className="flex min-h-0 flex-1">
        {/* Nodes Library — docked left (desktop only; mobile uses the palette row) */}
        {libraryMode === "docked" && (
          <div className="hidden md:block">
            <NodesLibraryPanel onAdd={addNode} t={t} mode="docked" onSetMode={setLibraryModePersist} />
          </div>
        )}
        {/* React Flow canvas */}
        <div className="relative min-h-0 flex-1" onDrop={onCanvasDrop} onDragOver={onCanvasDragOver}>
          <ReactFlow
            nodes={nodesWithStatus}
            edges={edgesWithStatus}
            nodeTypes={NODE_TYPES}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            onNodesChange={wrappedOnNodesChange}
            onEdgesChange={wrappedOnEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            fitView
            minZoom={0.2}
          >
            <Background />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => {
                const data = node.data as WfNodeData | undefined;
                return data?.node ? (KIND_COLORS[data.node.kind] ?? "#64748b") : "#64748b";
              }}
              nodeStrokeColor="transparent"
              style={{ background: "var(--wf-node-bg)", border: "1px solid var(--wf-node-border)" }}
            />
          </ReactFlow>

          {/* Nodes Library — floating (desktop), draggable by its header */}
          {aiOpen && (
            <AiGeneratePanel
              onApply={applyGeneratedGraph}
              onClose={() => setAiOpen(false)}
              t={t}
              currentGraph={fromReactFlow(nodes, edges)}
            />
          )}
          {reviewOpen && (
            <AiReviewPanel graph={fromReactFlow(nodes, edges)} onClose={() => setReviewOpen(false)} t={t} />
          )}
          {libraryMode === "float" && (
            <div className="absolute z-40 hidden md:block" style={{ left: libFloatPos.x, top: libFloatPos.y }}>
              <NodesLibraryPanel
                onAdd={addNode}
                t={t}
                mode="float"
                onSetMode={setLibraryModePersist}
                onFloatDragStart={startLibFloatDrag}
              />
            </div>
          )}
          {/* Nodes Library — hidden → compact re-show launcher (desktop) */}
          {libraryMode === "hidden" && (
            <button
              type="button"
              onClick={() => setLibraryModePersist("docked")}
              title={t("wf.lib.show")}
              className="absolute left-3 top-3 z-40 hidden items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-600 shadow-md transition hover:border-[var(--color-accent)] md:inline-flex dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            >
              <PanelLeft size={14} aria-hidden /> {t("wf.lib.title")}
            </button>
          )}

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
                  className="rounded-lg bg-[var(--accent-fill)] px-3 py-1 text-sm font-semibold text-white hover:opacity-90"
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

          {/* Edge toolbar — shown when an edge is clicked: delete + (condition) relabel true/false */}
          {selectedEdge && (
            <div className="absolute left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
              <span className="px-1 text-xs font-semibold text-neutral-500">{t("wf.editor.editEdge")}</span>
              {(selectedEdge.label === "true" || selectedEdge.label === "false") && (
                <select
                  value={String(selectedEdge.label)}
                  onChange={(e) => relabelEdge(selectedEdge.id, e.target.value)}
                  aria-label={t("wf.editor.condEdgeLabel")}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              )}
              <button
                type="button"
                onClick={() => deleteEdge(selectedEdge.id)}
                className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/20"
              >
                <Trash2 size={13} aria-hidden /> {t("wf.editor.deleteEdge")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedEdgeId(null)}
                aria-label={t("wf.editor.closePanel")}
                className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>
          )}

          {/* Floating config panel (desktop, panelMode "float") — draggable overlay */}
          {panelMode === "float" && selectedWfNode && (
            <div
              className="absolute z-40 hidden w-72 flex-col rounded-xl border border-neutral-200 bg-white shadow-2xl md:flex dark:border-neutral-700 dark:bg-neutral-900"
              style={{ left: floatPos.x, top: floatPos.y, maxHeight: "calc(100% - 2rem)" }}
            >
              <div
                onMouseDown={startFloatDrag}
                className="flex shrink-0 cursor-move items-center justify-between rounded-t-xl border-b border-neutral-100 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/40"
              >
                <span className="text-xs font-semibold text-neutral-500">{t("wf.editor.configTitle")}</span>
                <button
                  type="button"
                  onClick={() => setPanelModePersist("right")}
                  aria-label={t("wf.editor.panelDock")}
                  title={t("wf.editor.panelDock")}
                  className="rounded p-1 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-700"
                >
                  <PanelRight size={14} aria-hidden />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NodeConfigPanel
                  node={selectedWfNode}
                  onChange={onNodeConfigChange}
                  onDelete={() => handleDeleteNode(selectedWfNode.id)}
                  allNodes={allWfNodes}
                  edges={edges}
                />
              </div>
            </div>
          )}
        </div>

        {/* Desktop config panel — docked right (panelMode "right"); "float" mode
            renders a draggable overlay inside the canvas instead. Mobile → sheet. */}
        {panelMode === "right" && (
          <div className="hidden w-72 shrink-0 border-l border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900 md:block">
            {selectedWfNode ? (
              <NodeConfigPanel
                node={selectedWfNode}
                onChange={onNodeConfigChange}
                onDelete={() => handleDeleteNode(selectedWfNode.id)}
                allNodes={allWfNodes}
                edges={edges}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-sm text-neutral-400">
                {t("wf.editor.noSelection")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile config panel — animated bottom sheet + scrim (H). Stays mounted
          while sliding; unmounts after the close transition (onTransitionEnd). */}
      {sheetMounted && sheetNode && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 md:hidden ${sheetOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            onClick={() => setSelectedId(null)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("wf.editor.configTitle")}
            className={`fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-300 ease-out md:hidden dark:border-neutral-700 dark:bg-neutral-900 ${sheetOpen ? "translate-y-0" : "translate-y-full"}`}
            style={{ maxHeight: "65dvh" }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
              <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                {t("wf.editor.configTitle")}
              </span>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                aria-label={t("wf.editor.closePanel")}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NodeConfigPanel
                node={sheetNode}
                onChange={onNodeConfigChange}
                onDelete={() => sheetNode && handleDeleteNode(sheetNode.id)}
                allNodes={allWfNodes}
                edges={edges}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
