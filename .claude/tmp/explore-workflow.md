## 1. Workflow Graph Types

**File:** `D:/Projects/personal_projects/LAAM/src/lib/workflow/types.ts` (lines 1-68)

```typescript
export type WfNodeKind = "agent" | "connector" | "condition" | "foreach"; // A0 + G1

export type WfAgentNode = {
  id: string;
  kind: "agent";
  prompt: string; // interpolated (sink:"text")
  system?: string; // system prompt riÃªng cá»§a node; thiáº¿u â†’ default
  model?: string; // SEAM D-RUNTIME â€” A0 bá» qua (luÃ´n dÃ¹ng harness máº·c Ä‘á»‹nh)
  format?: Record<string, unknown>; // B1: JSON-schema cho Ollama structured output
};

export type WfConnectorNode = {
  id: string;
  kind: "connector";
  connectorId: string; // hiá»ƒn thá»‹/UI; execute() route theo `action`
  action: string; // tool name, vd "demo_list_tasks"
  args: Record<string, unknown>; // má»—i string value cÃ³ thá»ƒ chá»©a {{...}} (sink:"arg")
};

export type Op = "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains" | "not_contains" | "exists" | "not_exists";
export type Comparator = { left: string; op: Op; right?: unknown };
export type Predicate = Comparator | { all: Predicate[] } | { any: Predicate[] };

export type WfConditionNode = { id: string; kind: "condition"; when: Predicate };
export type WfForeachNode = { id: string; kind: "foreach"; items: string; body: WorkflowGraph };

export type WfNode = WfAgentNode | WfConnectorNode | WfConditionNode | WfForeachNode;
export type WfEdge = { from: string; to: string; label?: string }; // label cho nhÃ¡nh condition ("true"/"false")

export type WorkflowGraph = {
  nodes: WfNode[];
  edges: WfEdge[];
  viewport?: unknown;
  positions?: Record<string, { x: number; y: number }>; // Editor-persisted canvas layout
};

export type Budget = { maxSteps: number; maxForeachItems: number };
export const DEFAULT_BUDGET: Budget = { maxSteps: 200, maxForeachItems: 100 };

export type RunContext = {
  trigger: Record<string, unknown>;
  steps: Record<string, { output: unknown }>;
  vars: Record<string, unknown>;
};

export type StepRecord = {
  nodeId: string;
  kind: WfNodeKind;
  seq: number;
  status: "running" | "succeeded" | "failed";
  input?: unknown;
  output?: unknown;
  error?: string;
  parentNodeId?: string; // G1: foreach iteration â†’ id cá»§a foreach node
};
```

---

## 2. Engine Execution Path (buildRunNode and Node Dispatch)

**File:** `D:/Projects/personal_projects/LAAM/src/lib/workflow/engine.ts` (lines 1-162)

The engine is a **pure, recursive walker** driven by DI callback `runNode(node, ctx)`:

```typescript
export type EngineDeps = {
  runNode: (node: WfNode, ctx: RunContext) => Promise<unknown>;
  onStep: (step: StepRecord) => Promise<void>;
  evalPredicate: (pred: Predicate, ctx: RunContext) => boolean;
  shouldStop?: () => Promise<boolean>; // W4 cancel
};

async function walkGraph(
  graph: WorkflowGraph,
  deps: EngineDeps,
  ctx: RunContext,
  budget: Budget,
  counter: Counter,
  parentNodeId: string | undefined,
): Promise<WalkResult> {
  // ... iterates via edges, checks budget (step counter += 1), emits onStep (runningâ†’succeeded/failed)

  // â”€â”€ foreach: vÃ²ng láº·p sub-graph; KHÃ”NG Ä‘i qua runNode â”€â”€
  if (node.kind === "foreach") {
    const items = resolveTemplate(node.items, ctx, "arg");
    if (!Array.isArray(items)) throw new Error(`foreach: items khÃ´ng pháº£i máº£ng`);
    await deps.onStep({ ...base, status: "running", input: { count: items.length } });
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const subCtx: RunContext = { trigger: ctx.trigger, vars: { ...ctx.vars, item, index }, steps: {} };
      const sub = await walkGraph(node.body, deps, subCtx, budget, counter, node.id);
      if (sub.status === "cancelled") return { status: "cancelled" };
      if (sub.status === "failed") { /* fail-stop */ }
      outputs.push(sub.terminalOutput);
    }
    ctx.steps[node.id] = { output: outputs };
    continue;
  }

  // â”€â”€ condition: eval predicate, Ä‘i cáº¡nh label===String(káº¿t quáº£) â”€â”€
  if (node.kind === "condition") {
    let result: boolean;
    try {
      result = deps.evalPredicate(node.when, ctx);
    } catch (e) { /* fail-loud */ }
    cur = graph.edges.find((e) => e.from === node.id && e.label === String(result))?.to;
    continue;
  }

  // â”€â”€ agent/connector: cháº¡y qua runNode (há»£p Ä‘á»“ng A0) â”€â”€
  try {
    const output = await deps.runNode(node, ctx);
    ctx.steps[node.id] = { output };
  } catch (e) { /* fail-stop */ }
}
```

**Connector node execution path** (via DI buildRunNode):

**File:** `D:/Projects/personal_projects/LAAM/src/lib/workflow/executors.ts` (lines 16-28)

```typescript
export async function runConnectorNode(
  node: WfConnectorNode,
  ctx: RunContext,
  deps: ConnectorDeps,
): Promise<unknown> {
  const args = interpolateArgs(node.args ?? {}, ctx); // Deep walk: string â†’ resolveTemplate(sink:"arg")
  const result = await deps.execute(node.action, args);
  // execute() tráº£ {error} thay vÃ¬ throw â€” nÃ¢ng thÃ nh fail-stop node
  if (result && typeof result === "object" && "error" in (result as Record<string, unknown>)) {
    throw new Error(String((result as { error: unknown }).error));
  }
  return result;
}
```

**Where buildRunNode is wired** (persistence layer):

**File:** `D:/Projects/personal_projects/LAAM/src/lib/workflow/run.ts` (lines 75-179)

```typescript
export async function executeRunRow(runRow: RunRow, deps: ExecuteRunDeps): Promise<ExecuteRunRowResult> {
  const baseRunNode = deps.buildRunNode(runRow.userId, { dryRun: runRow.dryRun ?? false });
  const runNode = withWriteIdempotency(baseRunNode, { db: deps.db, runId });
  // dryRun MOCKS connector WRITE actions (no real side-effects) â† BLAST-RADIUS GATE (HIGH fail-closed for scheduled)
  
  const result = await runWorkflow(snapshot, { runNode, onStep, evalPredicate, shouldStop }, emptyContext(...), budget);
  // ... persist steps to DB via onStep (runningâ†’update row) + finalize
}
```

**MCP node branch location:** Would go after `condition` check in `walkGraph` (engine.ts ~130), before `agent/connector` fallthrough. Create `if (node.kind === "mcp")` block, call `runNode(node, ctx)` (same contract), emit `onStep`. MCP deps injected via buildRunNode.

**PIN:** Workflow agent nodes use **local model only** (Ollama, no Claude API).

---

## 3. Validation: assertRunnable / coerceGraph

**File:** `D:/Projects/personal_projects/LAAM/src/lib/workflow/validate.ts` (lines 54-107)

```typescript
export function assertRunnable(graph: WorkflowGraph): void {
  // Checks:
  // - id unique
  // - edges point to existing nodes
  // - in-degree â‰¤ 1 (no merge/fan-in)
  // - condition: exactly 2 edges labeled {true, false}
  // - other nodes: â‰¤ 1 out-edge
  // - exactly 1 start node
  // - all reachable (no orphan)
  // - no cycle
  // - foreach body: recursive assertRunnable

  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) throw new Error("validate: trÃ¹ng node id");
  
  const out = new Map<string, { to: string; label?: string }[]>();
  const inCount = new Map<string, number>();
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) throw new Error(`validate: edge trá» node unknown`);
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push({ to: e.to, label: e.label });
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
  }

  for (const [id, c] of inCount) if (c > 1) throw new Error(`validate: merge táº¡i "${id}"`);
  
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const node of graph.nodes) {
    if (node.kind === "agent" && node.format !== undefined) {
      if (typeof node.format !== "object" || node.format === null || Array.isArray(node.format)) {
        throw new Error(`validate: agent "${node.id}" â€” format pháº£i lÃ  object JSON-schema`);
      }
    }
    const outs = out.get(node.id) ?? [];
    if (node.kind === "condition") {
      const labels = outs.map((o) => o.label).sort();
      if (outs.length !== 2 || labels[0] !== "false" || labels[1] !== "true") {
        throw new Error(`validate: condition "${node.id}" cáº§n Ä‘Ãºng 2 cáº¡nh ra label true+false`);
      }
    } else if (outs.length > 1) {
      throw new Error(`validate: branch táº¡i "${node.id}" â€” chá»‰ condition má»›i phÃ¢n nhÃ¡nh`);
    }
  }

  // DFS validation: no cycle, all reachable
  const seen = new Set<string>();
  const stack = [starts[0].id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) throw new Error("validate: cycle phÃ¡t hiá»‡n");
    seen.add(cur);
    for (const o of out.get(cur) ?? []) stack.push(o.to);
  }
  if (seen.size !== graph.nodes.length) throw new Error("validate: node má»“ cÃ´i");

  // foreach body: validate Ä‘á»‡ quy
  for (const node of byId.values()) {
    if (node.kind === "foreach") assertRunnable(node.body);
  }
}
```

**For new 'mcp' node kind:** Update `assertRunnable` to add validation block after agent (check format-like props if any), treat as non-branching (â‰¤1 out-edge like connector).

---

## 4. Editor: WorkflowEditor.tsx + NodesLibraryPanel.tsx + NodeConfigPanel.tsx

### (a) NODE_TYPES Library Array (4 Items)

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/NodesLibraryPanel.tsx` (lines 19-24)

```typescript
const NODE_TYPES: { kind: WfNodeKind; Icon: typeof Bot; color: string }[] = [
  { kind: "agent", Icon: Bot, color: "#a855f7" },
  { kind: "connector", Icon: Plug, color: "#06b6d4" },
  { kind: "condition", Icon: GitBranch, color: "#f59e0b" },
  { kind: "foreach", Icon: Repeat, color: "#10b981" },
];
```

### (b) Node Addition: Click + Drag

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/WorkflowEditor.tsx` (lines 428-470)

```typescript
const addNode = useCallback(
  (kind: WfNodeKind, position?: { x: number; y: number }) => {
    const wfNode = defaultNode(kind); // Creates WfNode with defaults
    const pos = position ?? rfInstance.screenToFlowPosition({
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

// Drag-to-add: canvas onDrop reads NODE_KIND_MIME
const onCanvasDrop = useCallback(
  (e: React.DragEvent) => {
    const kind = e.dataTransfer.getData(NODE_KIND_MIME) as WfNodeKind;
    if (!kind) return;
    e.preventDefault();
    addNode(kind, rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  },
  [addNode, rfInstance],
);
```

NodesLibraryPanel drag handler:

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/NodesLibraryPanel.tsx` (lines 83-104)

```typescript
{NODE_TYPES.map(({ kind, Icon, color }) => (
  <button
    key={kind}
    type="button"
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData(NODE_KIND_MIME, kind);
      e.dataTransfer.effectAllowed = "copy";
    }}
    onClick={() => onAdd(kind)}
    className="flex cursor-grab items-center gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-left transition hover:border-[var(--color-accent)] active:cursor-grabbing dark:border-neutral-700 dark:bg-neutral-800"
  >
    <span className="shrink-0" style={{ color }} aria-hidden>
      <Icon size={18} />
    </span>
    {/* ... name + desc from i18n ... */}
  </button>
))}
```

### (c) NodeConfigPanel Per-Kind Rendering + SchemaArgsForm Pattern

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/NodeConfigPanel.tsx` (lines 100-427)

```typescript
// â”€â”€ Agent form â”€â”€
function AgentForm({ node, onChange, t, suggestions }: { ... }) {
  // system (textarea) + prompt (textarea) + format (JSON schema, optional)
  return (
    <>
      {field(<>
        {label(t("wf.node.agent.systemLabel"))}
        <textarea className={inputCls()} rows={3} value={node.system ?? ""} onChange={(e) => onChange({ ...node, system: e.target.value || undefined })} />
        <VariableHints tokens={suggestions} inputRef={systemRef} value={node.system ?? ""} onChange={(v) => onChange({ ...node, system: v || undefined })} hintLabel={t("wf.node.insertVar")} />
      </>)}
      {field(<>
        {label(t("wf.node.agent.promptLabel"))}
        <textarea className={inputCls()} rows={4} value={node.prompt} onChange={(e) => onChange({ ...node, prompt: e.target.value })} />
        <VariableHints tokens={suggestions} inputRef={promptRef} value={node.prompt} onChange={(v) => onChange({ ...node, prompt: v })} hintLabel={t("wf.node.insertVar")} />
      </>)}
      {/* format: B1 structured output */}
      {field(<>
        {label(t("wf.node.agent.formatLabel"))}
        <textarea className={inputCls(!!formatError)} rows={5} value={formatText} onChange={(e) => handleFormat(e.target.value)} />
        {formatError && errorMsg(formatError)}
      </>)}
    </>
  );
}

// â”€â”€ Connector form â”€â”€
function ConnectorForm({ node, onChange, t, connectors, suggestions }: { ... }) {
  const selectedConnector = connectors.find((c) => c.id === node.connectorId) ?? null;
  const availableActions = selectedConnector?.tools ?? [];
  const useSelects = connectors.length > 0;

  return (
    <>
      {field(<>
        {label(t("wf.node.connector.idLabel"))}
        {useSelects ? (
          <select className={inputCls()} value={node.connectorId} onChange={(e) => onChange({ ...node, connectorId: e.target.value, action: "" })}>
            <option value="">{t("wf.node.connector.selectConnector")}</option>
            {connectors.map((c) => (
              <option key={c.id} value={c.id}>{c.name} {c.connected ? "ðŸŸ¢" : "âš«"}</option>
            ))}
          </select>
        ) : (
          <input type="text" className={inputCls()} value={node.connectorId} onChange={(e) => onChange({ ...node, connectorId: e.target.value })} />
        )}
      </>)}
      {field(<>
        {label(t("wf.node.connector.actionLabel"))}
        {useSelects ? (
          availableActions.length > 0 ? (
            <select className={inputCls()} value={node.action} disabled={!node.connectorId} onChange={(e) => onChange({ ...node, action: e.target.value, args: {} })}>
              <option value="">{t("wf.node.connector.selectAction")}</option>
              {availableActions.map((tool) => (
                <option key={tool.name} value={tool.name} title={tool.description}>{tool.name}</option>
              ))}
            </select>
          ) : (<>{/* input field */}</>)
        ) : (
          <input type="text" className={inputCls()} value={node.action} onChange={(e) => onChange({ ...node, action: e.target.value })} />
        )}
      </>)}
      {field(
        <SchemaArgsForm node={node} onChange={onChange} t={t} suggestions={suggestions} schema={selectedTool?.parameters ?? null} />
      )}
    </>
  );
}

// â”€â”€ SchemaArgsForm: schema-driven or advanced JSON â”€â”€
function SchemaArgsForm({ node, onChange, t, suggestions, schema }: { ... }) {
  const { fields, propCount, flat } = parseArgSchema(schema);
  const schemaIsObject = !!schema && (schema as { type?: string }).type === "object";
  const defaultAdvanced = !schemaIsObject || (propCount > 0 && !flat);
  const [advanced, setAdvanced] = useState(defaultAdvanced);
  const [argsText, setArgsText] = useState(Object.keys(node.args).length ? JSON.stringify(node.args, null, 2) : "");
  const [argsError, setArgsError] = useState<string | null>(null);

  if (advanced || !schema) {
    return (
      <>
        <textarea className={inputCls(!!argsError)} rows={5} value={argsText} placeholder={'{\n  "key": "{{var}}"\n}'} onChange={(e) => handleRaw(e.target.value)} />
        {argsError && errorMsg(argsError)}
      </>
    );
  } else {
    // Render form fields per schema (ArgFieldInput for each)
    return (
      <div className="flex flex-col gap-3">
        {fields.map((f) => (
          <ArgFieldInput key={f.key} field={f} node={node} setArg={setArg} suggestions={suggestions} t={t} />
        ))}
      </div>
    );
  }
}

// â”€â”€ ArgFieldInput: renders boolean/enum/number/string per field type â”€â”€
// String fields show VariableHints for {{var}} insertion
```

### (d) WfNodeCard Rendering Per Kind

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/WorkflowEditor.tsx` (lines 104-223)

```typescript
function WfNodeCard({ data, selected }: { data: Record<string, unknown>; selected?: boolean }) {
  const { node: wf, status, actionsRef } = data as WfNodeData;
  const color = KIND_COLORS[wf.kind] ?? "#64748b";
  const label =
    wf.kind === "agent"
      ? wf.prompt.slice(0, 32) + (wf.prompt.length > 32 ? "â€¦" : "")
      : wf.kind === "connector"
        ? `${wf.connectorId}.${wf.action}`
        : wf.kind === "condition"
          ? "condition"
          : `foreach(${wf.items.slice(0, 20)})`;

  return (
    <div style={{ background: "var(--wf-node-bg)", borderLeftColor: color, /* ... */ }}>
      {/* Node kind label */}
      <div style={{ color, /* ... */ }}>{wf.kind}</div>
      <div style={{ fontFamily: "monospace", fontSize: 11 }}>{label}</div>
      
      {/* Handles: condition has 2 source (true/false); others have 1 */}
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

const KIND_COLORS: Record<WfNodeKind, string> = {
  agent: "#2563eb",
  connector: "#06b6d4",
  condition: "#d97706",
  foreach: "#16a34a",
};
```

---

## 5. MOBILE: Palette Row + Parity Mapping

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/WorkflowEditor.tsx` (lines 1028-1035)

```typescript
{/* Row 2: palette â€” MOBILE ONLY (desktop uses the left Nodes Library panel) */}
<div className="flex items-center gap-2 overflow-x-auto border-t border-neutral-100 px-3 pb-2 pt-1.5 md:hidden dark:border-neutral-800">
  <span className="shrink-0 text-xs text-neutral-400">{t("wf.editor.palette")}</span>
  <PaletteBtn label={t("wf.editor.addAgent")} onClick={() => addNode("agent")} />
  <PaletteBtn label={t("wf.editor.addConnector")} onClick={() => addNode("connector")} />
  <PaletteBtn label={t("wf.editor.addCondition")} onClick={() => addNode("condition")} />
  <PaletteBtn label={t("wf.editor.addForeach")} onClick={() => addNode("foreach")} />
</div>
```

### Desktop NodesLibraryPanel (Docked Left)

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/NodesLibraryPanel.tsx` (lines 26-107)

- 4-item cards: agent|connector|condition|foreach
- Drag-to-add or click-to-add
- Docked/float/hidden modes (localStorage persist)
- Icons (Bot, Plug, GitBranch, Repeat) + name + desc from i18n

### Mobile Bottom Sheet ConfigPanel

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/WorkflowEditor.tsx` (lines 1240-1270)

```typescript
{/* Mobile: node config sheet (bottom slide-up) â€” desktop uses right panel or float */}
{sheetMounted && sheetNode && (
  <>
    <div className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 md:hidden ${sheetOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={() => setSelectedId(null)} />
    <div role="dialog" aria-modal="true" className={`fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-300 ease-out md:hidden dark:border-neutral-700 dark:bg-neutral-900 ${sheetOpen ? "translate-y-0" : "translate-y-full"}`} style={{ maxHeight: "65dvh" }}>
      {/* Header + close */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
        <span className="text-xs font-semibold text-neutral-500">{t("wf.editor.configTitle")}</span>
        <button type="button" onClick={() => setSelectedId(null)} aria-label={t("wf.editor.closePanel")}>âœ•</button>
      </div>
      {/* Config panel (NodeConfigPanel) inside scroll container */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <NodeConfigPanel node={sheetNode} onChange={onNodeConfigChange} t={t} allWfNodes={allWfNodes} />
      </div>
    </div>
  </>
)}
```

### Parity Requirements

- **Mobile palette:** 4 buttons (agent|connector|condition|foreach) in horizontal scrollable row (md:hidden)
- **Desktop library:** Same 4 items as draggable cards (md:block docked; float/hidden optional)
- **Config panel:** Mobile = bottom sheet (slide-up); Desktop = right docked or float overlay (both use NodeConfigPanel component, no duplication)
- **Both share:** addNode(kind) callback, NodeConfigPanel forms, variable hints

---

## 6. i18n Keys: wf.* Namespace

**File:** `D:/Projects/personal_projects/LAAM/src/i18n/dictionaries/workflows.ts`

### Editor Keys
- `wf.editor.palette`: "Add step"
- `wf.editor.addAgent`, `.addConnector`, `.addCondition`, `.addForeach`: Button labels (mobile palette)
- `wf.editor.save`, `.saving`, `.saved`, `.saveErr`: Save status
- `wf.editor.configTitle`: "Configure node"
- `wf.editor.test`, `.testing`: Test (dry-run)
- `wf.editor.undo`, `.redo`: Undo/redo
- `wf.editor.panelFloat`, `.panelDock`: Float/dock config panel
- `wf.editor.condEdgeLabel`: "Edge label (true/false)"

### Node Config Keys
- `wf.node.jsonInvalid`: "Invalid JSON"
- `wf.node.agent.systemLabel`, `.promptLabel`, `.formatLabel`: Agent form labels
- `wf.node.agent.formatNotObject`: "Schema must be JSON object"
- `wf.node.connector.idLabel`, `.actionLabel`, `.argsLabel`: Connector form labels
- `wf.node.connector.selectConnector`, `.selectAction`: Dropdowns
- `wf.node.connector.notConnected`: "âš  Connector not connected"
- `wf.node.condition.label`, `.hint`, `.leftLabel`, `.opLabel`, `.rightLabel`: Condition form
- `wf.node.foreach.itemsLabel`, `.bodyLabel`, `.itemsHint`, `.bodyHint`: Foreach form
- `wf.node.insertVar`: "Insert:" (variable hint label)

### Library Panel Keys
- `wf.lib.title`: "Nodes Library"
- `wf.lib.float`, `.dock`, `.hide`, `.show`: Layout mode buttons
- `wf.lib.agent.name`, `.desc`: "Agent", "AI step: summarize, generate"
- `wf.lib.connector.name`, `.desc`: "Connector", "Call a connected app's tool"
- `wf.lib.condition.name`, `.desc`: "Condition", "Branch true / false"
- `wf.lib.foreach.name`, `.desc`: "Loop (Foreach)", "Iterate over each item"

All keys are tri-lingual: `{ vi: "...", en: "...", zh: "..." }`

---

## 7. Variable System: variableSuggestions / VariableHints / Interpolation

### variableSuggestions Function

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/variableHints.ts` (lines 1-37)

```typescript
export function variableSuggestions(
  allNodes: ReadonlyArray<WfNode>,
  edges: ReadonlyArray<{ source: string; target: string }>,
  currentNodeId: string,
): string[] {
  // BFS backward from currentNodeId via incoming edges â†’ ancestors only
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    const list = incoming.get(e.target);
    if (list) list.push(e.source);
    else incoming.set(e.target, [e.source]);
  }
  const ancestors = new Set<string>();
  const stack = [...(incoming.get(currentNodeId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    stack.push(...(incoming.get(id) ?? []));
  }
  const out = ["{{trigger}}"];
  for (const n of allNodes) {
    if (ancestors.has(n.id)) out.push(`{{steps.${n.id}.output}}`);
  }
  return out;
}
```

### VariableHints UI Component

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/NodeConfigPanel.tsx` (lines 56-98)

```typescript
function VariableHints({
  tokens,
  inputRef,
  value,
  onChange,
  hintLabel,
}: {
  tokens: string[]; // ["{{trigger}}", "{{steps.n1.output}}", ...]
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  hintLabel: string; // "Insert:"
}) {
  if (tokens.length === 0) return null;
  function insert(tok: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + tok + value.slice(end); // Insert at cursor
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + tok.length;
      try { el.setSelectionRange(pos, pos); } catch { }
    });
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-neutral-400">{hintLabel}</span>
      {tokens.map((tok) => (
        <button key={tok} type="button" onClick={() => insert(tok)} className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          {tok}
        </button>
      ))}
    </div>
  );
}
```

### {{var}} Interpolation at Runtime

**File:** `D:/Projects/personal_projects/LAAM/src/lib/workflow/interpolate.ts` (lines 1-68)

```typescript
const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;
const SOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;

export function resolvePath(path: string, ctx: RunContext): { found: boolean; value: unknown } {
  const segs = path.split(".").map((s) => s.trim()).filter(Boolean);
  let cur: unknown = ctx;
  for (const s of segs) {
    if (cur == null || typeof cur !== "object") return { found: false, value: undefined };
    if (!(s in (cur as Record<string, unknown>))) return { found: false, value: undefined };
    cur = (cur as Record<string, unknown>)[s];
  }
  return { found: true, value: cur };
}

// sink:"text" â†’ LUÃ”N string; sink:"arg" â†’ sole-token TYPE, embedded scalar coerce, embedded object FAIL
export function resolveTemplate(tpl: string, ctx: RunContext, sink: "arg" | "text"): unknown {
  const sole = tpl.match(SOLE);
  if (sole) {
    const { found, value } = resolvePath(sole[1], ctx);
    if (!found) {
      if (sink === "arg") throw new Error(`interpolation: missing path "${sole[1]}"`);
      console.warn(`[workflow] interpolation missing "${sole[1]}" â†’ ""`);
      return "";
    }
    if (sink === "arg") return value; // arg sole-token: giá»¯ nguyÃªn TYPE
    return isScalar(value) ? (value == null ? "" : String(value)) : JSON.stringify(value);
  }
  // embedded â†’ build string
  return tpl.replace(TOKEN, (_m, p1: string) => {
    const { found, value } = resolvePath(p1.trim(), ctx);
    if (!found) {
      if (sink === "arg") throw new Error(`interpolation: missing path "${p1.trim()}"`);
      console.warn(`[workflow] interpolation missing "${p1.trim()}" â†’ ""`);
      return "";
    }
    if (isScalar(value)) return value == null ? "" : String(value);
    if (sink === "text") return JSON.stringify(value);
    throw new Error(`interpolation: cannot embed object in connector arg â€” dÃ¹ng sole-token`);
  });
}

// Deep-interpolate connector args (sink "arg"): má»—i string value â†’ resolveTemplate
export function interpolateArgs(args: Record<string, unknown>, ctx: RunContext): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return resolveTemplate(v, ctx, "arg");
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(args) as Record<string, unknown>;
}
```

**Yes, connector-node args support {{var}} interpolation:** Each string value in `args: Record<string, unknown>` is passed to `interpolateArgs()` at runtime before calling `execute()`.

---

## 8. Tests: Patterns and Mocking

### WorkflowEditor RTL Test Pattern

**File:** `D:/Projects/personal_projects/LAAM/src/components/workflows/editor/WorkflowEditor.test.tsx` (lines 1-150)

```typescript
// Mock @xyflow/react entirely â€” return a simplified test-friendly component
vi.mock("@xyflow/react", () => {
  const { useState, useCallback } = require("react") as typeof import("react");
  function ReactFlow({
    children, onNodeClick, onPaneClick, nodes, nodeTypes, onConnect, edges, onEdgeClick,
  }: { /* props */ }) {
    const [mockSelectedId, setMockSelectedId] = useState<string | null>(null);
    return (
      <div data-testid="react-flow">
        <span data-testid="node-count">{nodes?.length ?? 0}</span>
        {nodes?.map((n) => {
          const wf = (n.data as { node: { kind: string; prompt?: string; ... } }).node;
          const label = /* derive label per kind */;
          const NodeComp = nodeTypes?.wf;
          return (
            <div key={n.id}>
              <button data-testid={`node-${n.id}`} onClick={(e) => { setMockSelectedId(n.id); onNodeClick?.(e, n); }}>
                {label}
              </button>
              {NodeComp && <NodeComp data={n.data} selected={mockSelectedId === n.id} id={n.id} />}
            </div>
          );
        })}
        {/* edges as buttons */}
        {edges?.map((e, i) => (
          <button key={e.id ?? i} data-testid={`edge-${i}`} onClick={(ev) => onEdgeClick?.(ev, e)}>
            {String(e.label ?? "edge")}
          </button>
        ))}
        {children}
      </div>
    );
  }
  return { ReactFlow, ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, /* ... */ };
});

// Spy on assertRunnable to control pass/fail
const mockAssertRunnable = vi.fn();
vi.mock("@/lib/workflow/validate", () => ({ assertRunnable: (...args: unknown[]) => mockAssertRunnable(...args) }));

// Tests: palette add, save/validate, error handling
test("palette add appends node to state", () => {
  const { getByText, getByTestId } = render(<WorkflowEditor workflowId="wf1" fetchImpl={buildFetch(...)} />);
  expect(getByTestId("node-count")).toHaveTextContent("1"); // initial
  fireEvent.click(getByText(t("wf.editor.addAgent")));
  expect(getByTestId("node-count")).toHaveTextContent("2");
});
```

### Engine Test Pattern

**File:** `D:/Projects/personal_projects/LAAM/src/lib/workflow/engine.test.ts` (lines 1-94)

```typescript
describe("runWorkflow (linear)", () => {
  const chain: WorkflowGraph = {
    nodes: [
      { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
      { id: "n2", kind: "agent", prompt: "TÃ³m táº¯t {{steps.n1.output.count}}." },
    ],
    edges: [{ from: "n1", to: "n2" }],
  };

  test("cháº¡y Ä‘Ãºng thá»© tá»±, truyá»n context, succeeded", async () => {
    const steps: StepRecord[] = [];
    const runNode = vi.fn(async (node) => (node.id === "n1" ? { count: 2 } : "OK"));
    const r = await runWorkflow(
      chain,
      { runNode, onStep: async (s) => { steps.push({ ...s }); }, evalPredicate },
      emptyContext({}),
    );
    expect(r.status).toBe("succeeded");
    expect(runNode.mock.calls.map((c) => c[0].id)).toEqual(["n1", "n2"]);
    expect(r.context.steps["n1"].output).toEqual({ count: 2 });
    expect(r.context.steps["n2"].output).toBe("OK");
    expect(steps.map((s) => `${s.nodeId}:${s.status}`)).toEqual(["n1:running", "n1:succeeded", "n2:running", "n2:succeeded"]);
  });
});

describe("runWorkflow (condition)", () => {
  const condGraph: WorkflowGraph = {
    nodes: [
      { id: "c", kind: "condition", when: { left: "{{steps.x.output}}", op: "gt", right: 0 } },
      { id: "t", kind: "agent", prompt: "yes" },
      { id: "f", kind: "agent", prompt: "no" },
    ],
    edges: [{ from: "c", to: "t", label: "true" }, { from: "c", to: "f", label: "false" }],
  };

  test("true-branch: chá»‰ cháº¡y node 't'", async () => {
    const runNode = vi.fn(async (node) => node.id === "t" ? "TRUE" : "FALSE");
    const evalP = vi.fn(() => true);
    const r = await runWorkflow(condGraph, { runNode, onStep: async () => {}, evalPredicate: evalP }, emptyContext({}));
    expect(runNode.mock.calls.map((c) => (c[0] as WfNode).id)).toEqual(["t"]);
  });
});
```

### Executor Test Pattern

**File:** `D:/Projects/personal_projects/LAAM/src/lib/workflow/executors.test.ts` (lines 1-103)

```typescript
describe("runConnectorNode", () => {
  test("interpolate args rá»“i execute; tráº£ output", async () => {
    const ctx = emptyContext({});
    ctx.steps["n0"] = { output: { pri: 2 } };
    const node: WfConnectorNode = {
      id: "n1", kind: "connector", connectorId: "demo", action: "demo_create_task",
      args: { priority: "{{steps.n0.output.pri}}", title: "x" },
    };
    const execute = vi.fn(async () => ({ id: "t1" }));
    const out = await runConnectorNode(node, ctx, { execute });
    expect(execute).toHaveBeenCalledWith("demo_create_task", { priority: 2, title: "x" });
    expect(out).toEqual({ id: "t1" });
  });

  test("execute tráº£ {error} â†’ throw (fail-stop node)", async () => {
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} };
    const execute = vi.fn(async () => ({ error: "chÆ°a káº¿t ná»‘i" }));
    await expect(runConnectorNode(node, emptyContext({}), { execute })).rejects.toThrow(/chÆ°a káº¿t ná»‘i/);
  });
});

describe("runAgentNode â€” structured output (format)", () => {
  const FORMAT = { type: "object", properties: { verdict: { enum: ["PASS", "FAIL"] }, reason: { type: "string" } }, required: ["verdict"] };
  const node: WfAgentNode = { id: "judge", kind: "agent", prompt: "ÄÃ¡nh giÃ¡ káº¿t quáº£.", format: FORMAT };

  test("format â†’ truyá»n vÃ o call CUá»I; output = object Ä‘Ã£ parse", async () => {
    const callOllama = vi.fn(async () => ({ message: { content: '{"verdict":"PASS","reason":"ok"}' } }));
    const out = await runAgentNode(node, emptyContext({}), {
      runRounds: vi.fn(async (messages) => messages),
      callOllama,
      dispatch: vi.fn(),
      tools: [],
    });
    expect(out).toEqual({ verdict: "PASS", reason: "ok" });
    expect(callOllama).toHaveBeenCalledTimes(1);
    expect(callOllama).toHaveBeenLastCalledWith(expect.any(Array), [], FORMAT);
  });

  test("JSON bá»c ```json fence (qwen quirk) â†’ váº«n parse Ä‘Æ°á»£c", async () => {
    const callOllama = vi.fn(async () => ({
      message: { content: '```json\\n{"verdict":"PASS","reason":"fence"}\\n```' },
    }));
    const out = await runAgentNode(node, emptyContext({}), deps(callOllama));
    expect(out).toEqual({ verdict: "PASS", reason: "fence" });
    expect(callOllama).toHaveBeenCalledTimes(1);
  });
});
```

Key patterns:
- Engine: mock `runNode`, `onStep`, `evalPredicate` as vi.fn; pass custom RunContext
- Executors: mock `execute`, `callOllama`, `dispatch` as vi.fn; verify interpolation + error handling
- UI: mock ReactFlow + assertRunnable; render + fireEvent to test palette/save flow