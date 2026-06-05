# AI Workflow — Phase D: Drag-Drop Editor Plan

> subagent-driven. Branch `feat/wf-editor` (base = local HEAD, backend + mgmt-page done). **UI built BLIND** → pure serialization is fully tested; config forms RTL-tested; the React Flow canvas drag/connect interactions are FLAGGED for user live QA (can't run a browser). Reuse `@xyflow/react` exactly as `src/components/graph-canvas.tsx` does.

**Goal (req #2 kéo-thả):** a visual editor at `/workflows/[id]/edit` to build/modify a workflow graph (4 node kinds), draw edges (condition true/false), save with validation. + a blank-create flow (resolves the removed `/workflows/new` link).

**Design decisions (autonomous, for review):**
- The load-bearing, testable core is the **pure serialization** `toReactFlow(graph)` / `fromReactFlow(nodes, edges)` — round-trip must preserve every node kind's config + edge labels. Fully unit-tested.
- The canvas itself (drag to position, connect to draw edges) uses React Flow built-ins (study graph-canvas.tsx) — minimal custom logic; FLAGGED for live QA.
- Save validates client-side (`assertRunnable`) for instant feedback AND server-side (the PATCH route re-validates — never trust client).
- Add `GET /api/workflows/[id]` (also fixes E's concern) + `PATCH /api/workflows/[id]` (update name/graph, owner-checked, assertRunnable → 400).

---

## Task 1: API — GET + PATCH `/api/workflows/[id]`
- `src/app/api/workflows/[id]/route.ts`: `GET` (session; return the workflow if `userId===session.user.id`, else 404) + `PATCH` (body {name?, graph?}; owner-check 404; if graph present → `assertRunnable` → 400 on invalid; update + `updatedAt`; return updated row).
- Test (mock db): GET own → 200; GET other → 404; PATCH updates graph; PATCH invalid graph → 400; PATCH other-user → 404.
- Commit `feat(workflow): D GET+PATCH /api/workflows/[id]`.

## Task 2: Graph ↔ React Flow serialization (`src/components/workflows/editor/graph-serde.ts`) — PURE, fully tested
- `toReactFlow(graph: WorkflowGraph): { nodes: RFNode[]; edges: RFEdge[] }`: each WfNode → an RF node `{ id, type:'wf', position (use node.position if stored else auto-layout by index), data: { node } }`; each WfEdge → RF edge `{ id:`${from}->${to}-${label??''}`, source:from, target:to, label }`.
- `fromReactFlow(rfNodes, rfEdges): WorkflowGraph`: inverse — strips RF presentation, rebuilds `{nodes, edges}` preserving each node's kind+config and edge labels. Position may be persisted in graph (add optional `position?: {x,y}` to nodes via `viewport`/per-node — OR store positions in `graph.viewport`/a side map; keep WfNode clean — store positions in RF only + auto-layout on load is acceptable for v1; document).
- Test (`graph-serde.test.ts`): round-trip `fromReactFlow(toReactFlow(g)) deep-equals g` for a graph containing ALL 4 kinds + a condition with true/false edges + a foreach with a body. Edge labels preserved. This is the core correctness gate.
- Commit `feat(workflow): D graph↔reactflow serialization (pure, round-trip tested)`.

## Task 3: Node config forms (`src/components/workflows/editor/NodeConfigPanel.tsx`) + RTL
- A panel that, given the selected node, renders the right form:
  - agent: `system` (textarea), `prompt` (textarea).
  - connector: `connectorId` + `action` (text/select), `args` (JSON textarea → parsed; show parse error).
  - condition: `when` predicate builder — minimally a JSON textarea for the `Predicate` (parsed) OR a simple {left, op(select), right} form. Keep v1 simple (JSON textarea + validate parse).
  - foreach: `items` (text, a `{{...}}` template) + `body` (nested — v1: a JSON textarea for the body graph, or a note "edit body separately"; keep minimal).
- On change → updates the node's `data.node` (via a callback). 
- RTL test: renders the agent form with a node's values; editing prompt calls the onChange with updated config; connector args JSON parse-error shows.
- Commit `feat(workflow): D node config panel + forms`.

## Task 4: Editor page + canvas (`/workflows/[id]/edit` + `WorkflowEditor.tsx`)
- `src/app/workflows/[id]/edit/page.tsx` (server shell, auth) + `src/components/workflows/editor/WorkflowEditor.tsx` (client). 
- Load: `GET /api/workflows/[id]` → `toReactFlow` → React Flow state (study graph-canvas.tsx for the `<ReactFlow>` setup, `useNodesState`/`useEdgesState`, dynamic import ssr:false if graph-canvas does).
- Palette: buttons to add a node of each kind (appends an RF node with default config).
- Select node → `NodeConfigPanel` (Task 3) edits it.
- Connect nodes → React Flow `onConnect` adds an edge; if source is a condition node, prompt/toggle the label (true/false).
- Save: `fromReactFlow` → `assertRunnable` (client preflight; show validation error inline) → `PATCH /api/workflows/[id]` → toast/redirect. 
- Also `/workflows/new/page.tsx`: creates a starter workflow (`POST /api/workflows` with `{name:"Workflow mới", graph:{nodes:[{id:"n1",kind:"agent",prompt:""}],edges:[]}}`) then redirects to `/workflows/[id]/edit`. Re-add the "New blank" link on the list page (it now works).
- i18n vi/en/zh for editor strings.
- RTL test (behavior, NOT canvas): the save flow calls `fromReactFlow`+validate+PATCH (can test the save handler with a stub graph); palette-add appends a node to state. (Canvas drag/connect = flagged QA.)
- Commit `feat(workflow): D editor page + canvas + blank-create + i18n`.

## Task 5: Verify
- `npx tsc --noEmit` → 0. `npx vitest run` → all green (report count). No new deps (@xyflow/react already present). No `next dev`/build.

## Self-review
GET+PATCH owner-checked + validate? serialization round-trip covers all 4 kinds + labels? save validates client+server? blank-create works (dead link fixed)? i18n 3 langs? tsc 0 + suite green? Canvas interactions explicitly flagged for QA?
