# AI Workflow — A0 (vertical slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một workflow thật (1 `connector` node → 1 `agent` node, tuyến tính) chạy hết đường cho 1 user thật qua manual-trigger API, sinh `workflow_run` + `workflow_run_step`, phát SSE, trả kết quả — **không editor**, seed qua API.

**Architecture:** Engine = bộ **điều phối** thuần (không runtime mới): `agent` node gọi orchestrator harness có sẵn (`runToolRounds` + `withSafety(makeDispatch())`), `connector` node gọi `connectors.execute()`. State = blackboard untyped + interpolation `{{...}}`. Lib thuần (DI) tách khỏi lớp persistence/route để test không cần DB/Ollama. Bám spec `docs/superpowers/specs/2026-06-05-ai-workflow-orchestration-design.md` (§4/§5) + memo `decisions/workflow-orchestration-architecture.md`.

**Tech Stack:** Next.js 16 App Router · Drizzle/Postgres · Vitest (DI mocks) · Ollama (qua `runToolRounds`).

**Branch:** `feat/workflow-a0` (isolate qua `superpowers:using-git-worktrees` lúc execute).

**A0 KHÔNG đụng:** scheduler · `workflow_schedule` table · condition/foreach · blast-radius gate · editor. Agent node A0 = **read/judgment only** (#3): tool union chỉ internal read tools; `withSafety` bọc dispatch (write attempt → fail node).

**✅ Spec-refinement (CTO duyệt 06-05):** `resolveTemplate(tpl, ctx, sink)` **theo SINK**: `sink:"text"` (agent prompt) = **total→string** (scalar=`String`, object=`JSON.stringify`, **kể cả sole-token** — đích vốn là chuỗi, stringify sống MỘT chỗ trong interpolate); `sink:"arg"` (connector arg) = sole-token **giữ type** (rủi ro lõi PIN-D3a: `priority:2`≠`"2"`), embedded scalar coerce, embedded object **fail-loud**. (A2) condition operand = arg-sink. Spec §5.2 đã reword khớp.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/lib/workflow/types.ts` | Hợp đồng: `WfNode`(agent\|connector), `WfEdge`, `WorkflowGraph`, `RunContext`, `StepRecord`. |
| `src/db/schema.ts` (modify) | +3 bảng `workflow`/`workflow_run`/`workflow_run_step` + type exports. |
| `src/lib/workflow/interpolate.ts` | `resolvePath` + `resolveTemplate(tpl,ctx,sink)` + `interpolateArgs` (PIN-D3a/b). |
| `src/lib/workflow/validate.ts` | `assertLinear(graph)` + `linearOrder(graph)` — cổng A0 (single-path acyclic). |
| `src/lib/workflow/executors.ts` | `runConnectorNode` + `runAgentNode` (DI: execute / runRounds+callOllama+dispatch+tools). |
| `src/lib/workflow/engine.ts` | `runWorkflow(graph, {runNode,onStep}, ctx0)` — duyệt tuyến tính, fail-stop. |
| `src/lib/workflow/ollama.ts` | `callOllamaChat(messages, tools)` — fetch Ollama (tách để route/run dùng). |
| `src/lib/workflow/run.ts` | `executeRun(...)` — load+snapshot+persist run/step+publish SSE quanh engine. |
| `src/app/api/workflows/route.ts` | `POST` create (seed) · `GET` list của user. |
| `src/app/api/workflows/[id]/run/route.ts` | `POST` manual trigger → `executeRun` → JSON {run, steps}. |

Test kèm mỗi lib file (`*.test.ts`). Unit test **mock toàn bộ** db/Ollama/connector (DI). DB thật chỉ cần ở E2E host (Task 8).

---

## Task 1: Workflow contracts (`types.ts`)

**Files:**
- Create: `src/lib/workflow/types.ts`
- Test: `src/lib/workflow/types.test.ts`

- [ ] **Step 1: Write the failing test** (type smoke — graph hợp lệ compile + StepRecord shape)

```ts
// src/lib/workflow/types.test.ts
import { describe, expect, test } from "vitest";
import type { WorkflowGraph, RunContext } from "./types";
import { emptyContext } from "./types";

describe("workflow types", () => {
  test("emptyContext khởi tạo blackboard rỗng", () => {
    const ctx: RunContext = emptyContext({ source: "manual" });
    expect(ctx.steps).toEqual({});
    expect(ctx.trigger).toEqual({ source: "manual" });
  });

  test("graph 1 connector → 1 agent hợp khuôn", () => {
    const g: WorkflowGraph = {
      nodes: [
        { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
        { id: "n2", kind: "agent", prompt: "Tóm tắt {{steps.n1.output.count}} việc." },
      ],
      edges: [{ from: "n1", to: "n2" }],
    };
    expect(g.nodes).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workflow/types.test.ts`
Expected: FAIL — `Cannot find module './types'`.

- [ ] **Step 3: Write `types.ts`**

```ts
// src/lib/workflow/types.ts
// Hợp đồng đóng băng cho Workflow engine (A0). Phase sau thêm 'condition'|'foreach'
// vào WfNodeKind + node mới — KHÔNG đổi shape có sẵn. Xem spec §4/§5.

export type WfNodeKind = "agent" | "connector"; // A0; +condition|foreach ở A2

export type WfAgentNode = {
  id: string;
  kind: "agent";
  prompt: string; // interpolated (sink:"text")
  system?: string; // system prompt riêng của node; thiếu → default
  model?: string; // SEAM D-RUNTIME — A0 bỏ qua (luôn dùng harness mặc định)
};

export type WfConnectorNode = {
  id: string;
  kind: "connector";
  connectorId: string; // hiển thị/UI; execute() route theo `action` (tool name)
  action: string; // tool name, vd "demo_list_tasks"
  args: Record<string, unknown>; // mỗi string value có thể chứa {{...}} (sink:"arg")
};

export type WfNode = WfAgentNode | WfConnectorNode;
export type WfEdge = { from: string; to: string };
export type WorkflowGraph = { nodes: WfNode[]; edges: WfEdge[]; viewport?: unknown };

// Blackboard. run_step = nguồn bền; context = working-set RAM (spec D-STATE).
export type RunContext = {
  trigger: Record<string, unknown>;
  steps: Record<string, { output: unknown }>;
  vars: Record<string, unknown>;
};

export function emptyContext(trigger: Record<string, unknown>): RunContext {
  return { trigger, steps: {}, vars: {} };
}

// Một node đã chạy — engine phát ra, run.ts persist + SSE.
export type StepRecord = {
  nodeId: string;
  kind: WfNodeKind;
  seq: number;
  status: "running" | "succeeded" | "failed";
  input?: unknown;
  output?: unknown;
  error?: string;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workflow/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/types.ts src/lib/workflow/types.test.ts
git commit -m "feat(workflow): A0 graph + context contracts"
```

---

## Task 2: Schema — 3 bảng workflow (`schema.ts`)

**Files:**
- Modify: `src/db/schema.ts` (cuối file, sau `connectorCredentials`)

> Drizzle-kit KHÔNG chạy trong sandbox agent (xem `decisions/db-migrations`). Bước `db:generate`/`db:migrate` là **host action của user** (Step 4). Unit test A0 mock `db` nên không cần migrate để chạy test.

- [ ] **Step 1: Thêm import type + 3 bảng vào `schema.ts`**

Ở đầu file, sau dòng `import type { AdapterAccountType } from "next-auth/adapters";` thêm:

```ts
import type { WorkflowGraph } from "@/lib/workflow/types";
```

Ở cuối file (sau `export type ConnectorCredential = ...`) thêm:

```ts
// ---------------------------------------------------------------------------
// Workflow orchestration (A0) — manual-trigger linear runs. workflow_schedule +
// condition/foreach columns arrive in later phases. graph = 1 JSONB (clone=copy
// 1 row). run.graphSnapshot = kế hoạch tĩnh lúc start (spec PIN-D4a). userId =
// danh tính thực thi (cred per-user). (spec §4.)
// ---------------------------------------------------------------------------

export const workflows = pgTable("workflow", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  graph: jsonb("graph").$type<WorkflowGraph>().notNull(),
  isTemplate: boolean("isTemplate").notNull().default(false),
  status: text("status").notNull().default("draft"), // draft | active | disabled
  version: integer("version").notNull().default(1),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const workflowRuns = pgTable("workflow_run", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workflowId: text("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(), // manual | schedule
  status: text("status").notNull().default("queued"), // queued|running|succeeded|failed|cancelled
  graphSnapshot: jsonb("graphSnapshot").$type<WorkflowGraph>().notNull(),
  context: jsonb("context"),
  error: text("error"),
  tokensIn: integer("tokensIn").notNull().default(0),
  tokensOut: integer("tokensOut").notNull().default(0),
  costUsd: doublePrecision("costUsd").notNull().default(0),
  startedAt: timestamp("startedAt", { mode: "date" }),
  finishedAt: timestamp("finishedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const workflowRunSteps = pgTable("workflow_run_step", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  runId: text("runId").notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
  nodeId: text("nodeId").notNull(),
  parentStepId: text("parentStepId"), // foreach lồng (A2)
  seq: integer("seq").notNull(),
  kind: text("kind").notNull(), // agent|connector|condition|foreach
  status: text("status").notNull(), // running|succeeded|failed|skipped
  input: jsonb("input"),
  output: jsonb("output"),
  error: text("error"),
  tokensIn: integer("tokensIn").notNull().default(0),
  tokensOut: integer("tokensOut").notNull().default(0),
  costUsd: doublePrecision("costUsd").notNull().default(0),
  startedAt: timestamp("startedAt", { mode: "date" }),
  finishedAt: timestamp("finishedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export type Workflow = typeof workflows.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type WorkflowRunStep = typeof workflowRunSteps.$inferSelect;
```

- [ ] **Step 2: Verify tsc sạch** (không cần DB)

Run: `npx tsc --noEmit`
Expected: exit 0 (không lỗi type; `WorkflowGraph` resolve từ Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(workflow): A0 schema — workflow/run/run_step tables"
```

- [ ] **Step 4: [HOST — user chạy] generate + apply migration**

> Agent KHÔNG chạy (drizzle-kit ngoài sandbox + agent-ops). User chạy trên host:

Run: `npm run db:generate && npm run db:migrate`
Expected: migration mới (vd `0004_*`) tạo 3 bảng; `git add drizzle/ && git commit -m "chore(db): migrate workflow A0 tables"`.

---

## Task 3: Interpolation (`interpolate.ts`) — PIN-D3a/b

**Files:**
- Create: `src/lib/workflow/interpolate.ts`
- Test: `src/lib/workflow/interpolate.test.ts`

- [ ] **Step 1: Write the failing test** (PIN-D3a là test-case đầu tiên theo spec)

```ts
// src/lib/workflow/interpolate.test.ts
import { describe, expect, test } from "vitest";
import { resolveTemplate, interpolateArgs } from "./interpolate";
import { emptyContext } from "./types";

function ctxWith(output: unknown) {
  const c = emptyContext({ source: "manual" });
  c.steps["n1"] = { output };
  return c;
}

describe("resolveTemplate — PIN-D3a sole-token pass-through giữ TYPE", () => {
  test("sole-token number → number, KHÔNG phải string", () => {
    const c = ctxWith({ priority: 2 });
    expect(resolveTemplate("{{steps.n1.output.priority}}", c, "arg")).toBe(2);
  });
  test("sole-token array → array nguyên type", () => {
    const c = ctxWith({ tags: ["a", "b"] });
    expect(resolveTemplate("{{steps.n1.output.tags}}", c, "arg")).toEqual(["a", "b"]);
  });
  test("sole-token boolean → boolean", () => {
    const c = ctxWith({ done: false });
    expect(resolveTemplate("{{steps.n1.output.done}}", c, "arg")).toBe(false);
  });
});

describe("resolveTemplate — text sink TOTAL→string (CTO 06-05, kể cả sole-token)", () => {
  test("sole-token object + text → JSON.stringify (KHÔNG giữ type)", () => {
    const c = ctxWith({ tasks: [{ t: 1 }] });
    expect(resolveTemplate("{{steps.n1.output.tasks}}", c, "text")).toBe('[{"t":1}]');
  });
  test("sole-token number + text → '2' (string)", () => {
    const c = ctxWith({ priority: 2 });
    expect(resolveTemplate("{{steps.n1.output.priority}}", c, "text")).toBe("2");
  });
});

describe("resolveTemplate — embedded", () => {
  test("scalar embedded → coerce string", () => {
    const c = ctxWith({ number: 5, title: "Bug" });
    expect(resolveTemplate("Issue #{{steps.n1.output.number}}: {{steps.n1.output.title}}", c, "text"))
      .toBe("Issue #5: Bug");
  });
  test("object embedded + sink text → JSON.stringify", () => {
    const c = ctxWith({ tasks: [{ t: 1 }] });
    expect(resolveTemplate("Data: {{steps.n1.output.tasks}}", c, "text"))
      .toBe('Data: [{"t":1}]');
  });
  test("object embedded + sink arg → THROW (fail-loud)", () => {
    const c = ctxWith({ tasks: [{ t: 1 }] });
    expect(() => resolveTemplate("x {{steps.n1.output.tasks}}", c, "arg")).toThrow(/object/i);
  });
});

describe("resolveTemplate — PIN-D3b + missing", () => {
  test("KHÔNG bracket-index: items[0] không index, → missing", () => {
    const c = ctxWith({ items: [9] });
    // "items[0]" là một segment literal, không tồn tại → arg sink throws
    expect(() => resolveTemplate("{{steps.n1.output.items[0]}}", c, "arg")).toThrow(/missing|không/i);
  });
  test("missing path + sink text → '' (warn)", () => {
    const c = ctxWith({});
    expect(resolveTemplate("[{{steps.n1.output.nope}}]", c, "text")).toBe("[]");
  });
});

describe("interpolateArgs — connector args deep", () => {
  test("giữ type number cho sole-token, coerce cho embedded", () => {
    const c = ctxWith({ priority: 3, id: "x9" });
    const out = interpolateArgs(
      { priority: "{{steps.n1.output.priority}}", title: "T-{{steps.n1.output.id}}", flag: true },
      c,
    );
    expect(out).toEqual({ priority: 3, title: "T-x9", flag: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workflow/interpolate.test.ts`
Expected: FAIL — `Cannot find module './interpolate'`.

- [ ] **Step 3: Write `interpolate.ts`**

```ts
// src/lib/workflow/interpolate.ts
// {{path}} = tra cứu property THUẦN vào RunContext. KHÔNG eval/Function/số học (spec
// §5.2 PIN-D3a). Hợp đồng theo SINK (CTO 06-05): sink 'text' = total→string (scalar=
// String, object=JSON.stringify, kể cả sole-token); sink 'arg' = sole-token giữ TYPE,
// embedded scalar coerce, embedded object FAIL-LOUD.
import type { RunContext } from "./types";

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;
const SOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;

// Walk dotted path. KHÔNG bracket-index (PIN-D3b): "a[0]" là 1 segment literal.
// Trả { found, value } để phân biệt undefined-thật với missing.
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

function isScalar(v: unknown): boolean {
  return v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

// sink:"text" → LUÔN string (scalar=String, object=JSON.stringify; sole-token & embedded).
// sink:"arg"  → sole-token giữ TYPE; embedded scalar coerce; embedded object/missing THROW.
export function resolveTemplate(tpl: string, ctx: RunContext, sink: "arg" | "text"): unknown {
  const sole = tpl.match(SOLE);
  if (sole) {
    const { found, value } = resolvePath(sole[1], ctx);
    if (!found) {
      if (sink === "arg") throw new Error(`interpolation: missing path "${sole[1]}"`);
      console.warn(`[workflow] interpolation missing "${sole[1]}" → ""`);
      return "";
    }
    if (sink === "arg") return value; // arg sole-token: giữ nguyên TYPE (rủi ro lõi PIN-D3a)
    // text sink = total→string: stringify MỘT chỗ (CTO 06-05), KHÔNG giữ type.
    return isScalar(value) ? (value == null ? "" : String(value)) : JSON.stringify(value);
  }
  // embedded → build string
  return tpl.replace(TOKEN, (_m, p1: string) => {
    const { found, value } = resolvePath(p1.trim(), ctx);
    if (!found) {
      if (sink === "arg") throw new Error(`interpolation: missing path "${p1.trim()}"`);
      console.warn(`[workflow] interpolation missing "${p1.trim()}" → ""`);
      return "";
    }
    if (isScalar(value)) return value == null ? "" : String(value);
    if (sink === "text") return JSON.stringify(value);
    throw new Error(`interpolation: cannot embed object in connector arg ("${p1.trim()}") — dùng sole-token`);
  });
}

// Deep-interpolate connector args (sink "arg"): mỗi string value → resolveTemplate.
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workflow/interpolate.test.ts`
Expected: PASS (toàn bộ — đặc biệt sole-token number `toBe(2)` không phải `"2"`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/interpolate.ts src/lib/workflow/interpolate.test.ts
git commit -m "feat(workflow): A0 interpolation — PIN-D3a sole-token pass-through + sink policy"
```

---

## Task 4: Validate + linear order (`validate.ts`)

**Files:**
- Create: `src/lib/workflow/validate.ts`
- Test: `src/lib/workflow/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workflow/validate.test.ts
import { describe, expect, test } from "vitest";
import { assertLinear, linearOrder } from "./validate";
import type { WorkflowGraph } from "./types";

const chain: WorkflowGraph = {
  nodes: [
    { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
    { id: "n2", kind: "agent", prompt: "x" },
  ],
  edges: [{ from: "n1", to: "n2" }],
};

describe("validate (A0 — single-path acyclic)", () => {
  test("linearOrder trả đúng thứ tự từ start", () => {
    expect(linearOrder(chain).map((n) => n.id)).toEqual(["n1", "n2"]);
  });
  test("reject branch (>1 cạnh ra)", () => {
    const g: WorkflowGraph = {
      nodes: [...chain.nodes, { id: "n3", kind: "agent", prompt: "y" }],
      edges: [{ from: "n1", to: "n2" }, { from: "n1", to: "n3" }],
    };
    expect(() => assertLinear(g)).toThrow(/branch|nhánh/i);
  });
  test("reject cycle", () => {
    const g: WorkflowGraph = {
      nodes: chain.nodes,
      edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n1" }],
    };
    expect(() => assertLinear(g)).toThrow(/cycle|chu trình/i);
  });
  test("reject edge trỏ node không tồn tại", () => {
    const g: WorkflowGraph = { nodes: chain.nodes, edges: [{ from: "n1", to: "zzz" }] };
    expect(() => assertLinear(g)).toThrow(/unknown|không tồn tại/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workflow/validate.test.ts`
Expected: FAIL — `Cannot find module './validate'`.

- [ ] **Step 3: Write `validate.ts`**

```ts
// src/lib/workflow/validate.ts
// Cổng A0/A1 (spec §5.5): engine tuyến tính chỉ chạy single-path acyclic.
// Reject branch/cycle/dangling — KHÔNG execute nửa chừng thứ engine chưa hiểu.
import type { WorkflowGraph, WfNode } from "./types";

export function assertLinear(graph: WorkflowGraph): void {
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) throw new Error("validate: trùng node id");
  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) throw new Error(`validate: edge trỏ node unknown (${e.from}→${e.to})`);
    outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
  }
  for (const [id, c] of outCount) if (c > 1) throw new Error(`validate: branch tại "${id}" (>1 cạnh ra) — A0 chỉ tuyến tính`);
  for (const [id, c] of inCount) if (c > 1) throw new Error(`validate: merge tại "${id}" (>1 cạnh vào) — A0 chỉ tuyến tính`);
  // start = node không có cạnh vào. 0 start (mọi node đều có cạnh vào) ⟹ CHẮC CHẮN cycle
  // (đồ thị hữu hạn). >1 start = rời rạc/forest. Cả hai reject; 0-start báo đúng là cycle.
  const starts = graph.nodes.filter((n) => !inCount.get(n.id));
  if (graph.nodes.length > 0 && starts.length === 0) {
    throw new Error("validate: cycle — không có node start (mọi node đều có cạnh vào)");
  }
  if (starts.length !== 1) throw new Error(`validate: cần đúng 1 start, có ${starts.length}`);
  // walk theo cạnh; nếu thăm lại → cycle; số node thăm phải = tổng node.
  const seen = new Set<string>();
  let cur: string | undefined = starts[0].id;
  while (cur) {
    if (seen.has(cur)) throw new Error("validate: cycle phát hiện");
    seen.add(cur);
    cur = graph.edges.find((e) => e.from === cur)?.to;
  }
  if (seen.size !== graph.nodes.length) throw new Error("validate: node mồ côi (không nối vào chain)");
}

export function linearOrder(graph: WorkflowGraph): WfNode[] {
  assertLinear(graph);
  const inCount = new Map<string, number>();
  for (const e of graph.edges) inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const order: WfNode[] = [];
  let cur: string | undefined = graph.nodes.find((n) => !inCount.get(n.id))!.id;
  while (cur) {
    order.push(byId.get(cur)!);
    cur = graph.edges.find((e) => e.from === cur)?.to;
  }
  return order;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workflow/validate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/validate.ts src/lib/workflow/validate.test.ts
git commit -m "feat(workflow): A0 validate linear graph + order (0-start reported as cycle)"
```

---

## Task 5: Node executors (`executors.ts`)

**Files:**
- Create: `src/lib/workflow/executors.ts`
- Test: `src/lib/workflow/executors.test.ts`

> DI: executor nhận deps đã bind `userId` ở lớp run (Task 7). Test mock toàn bộ — không Ollama/connector thật.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workflow/executors.test.ts
import { describe, expect, test, vi } from "vitest";
import { runConnectorNode, runAgentNode } from "./executors";
import { emptyContext } from "./types";
import type { WfConnectorNode, WfAgentNode } from "./types";

describe("runConnectorNode", () => {
  test("interpolate args rồi execute; trả output", async () => {
    const ctx = emptyContext({});
    ctx.steps["n0"] = { output: { pri: 2 } };
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_create_task", args: { priority: "{{steps.n0.output.pri}}", title: "x" } };
    const execute = vi.fn(async () => ({ id: "t1" }));
    const out = await runConnectorNode(node, ctx, { execute });
    expect(execute).toHaveBeenCalledWith("demo_create_task", { priority: 2, title: "x" });
    expect(out).toEqual({ id: "t1" });
  });

  test("execute trả {error} → throw (fail-stop node)", async () => {
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} };
    const execute = vi.fn(async () => ({ error: "chưa kết nối" }));
    await expect(runConnectorNode(node, emptyContext({}), { execute })).rejects.toThrow(/chưa kết nối/);
  });
});

describe("runAgentNode", () => {
  test("build messages từ prompt, chạy rounds, lấy text câu cuối", async () => {
    const ctx = emptyContext({});
    ctx.steps["n0"] = { output: { count: 3 } };
    const node: WfAgentNode = { id: "n1", kind: "agent", system: "SYS", prompt: "Có {{steps.n0.output.count}} việc." };
    const runRounds = vi.fn(async (messages) => messages); // no tool calls → trả nguyên
    const callOllama = vi.fn(async () => ({ message: { content: "Tóm tắt: 3 việc." } }));
    const out = await runAgentNode(node, ctx, { runRounds, callOllama, dispatch: vi.fn(), tools: [] });
    // prompt đã interpolate (sink text)
    expect(runRounds.mock.calls[0][0]).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Có 3 việc." },
    ]);
    // câu cuối lấy từ callOllama(convo, []) sau rounds (runToolRounds KHÔNG trả text cuối)
    expect(callOllama).toHaveBeenLastCalledWith(expect.any(Array), []);
    expect(out).toBe("Tóm tắt: 3 việc.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workflow/executors.test.ts`
Expected: FAIL — `Cannot find module './executors'`.

- [ ] **Step 3: Write `executors.ts`**

```ts
// src/lib/workflow/executors.ts
// Hai loại node A0. KHÔNG runtime mới: connector→connectors.execute; agent→
// runToolRounds + 1 call cuối lấy text (runToolRounds break KHÔNG push câu cuối).
// DI để test thuần. (spec §5 dispatch.)
import type { WfAgentNode, WfConnectorNode, RunContext } from "./types";
import type { ChatMessage, OllamaChatResponse } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";
import { resolveTemplate, interpolateArgs } from "./interpolate";

const DEFAULT_AGENT_SYSTEM =
  "Bạn là một bước xử lý trong workflow. Trả lời ngắn gọn, chính xác, đúng yêu cầu của bước.";

export type ConnectorDeps = {
  execute: (action: string, args: Record<string, unknown>) => Promise<unknown>;
};

export async function runConnectorNode(
  node: WfConnectorNode,
  ctx: RunContext,
  deps: ConnectorDeps,
): Promise<unknown> {
  const args = interpolateArgs(node.args ?? {}, ctx);
  const result = await deps.execute(node.action, args);
  // execute() trả {error} thay vì throw — nâng thành fail-stop node (spec §5.4).
  if (result && typeof result === "object" && "error" in (result as Record<string, unknown>)) {
    throw new Error(String((result as { error: unknown }).error));
  }
  return result;
}

export type AgentDeps = {
  runRounds: (
    messages: ChatMessage[],
    tools: ConnectorTool[],
    deps: { callOllama: (m: ChatMessage[], t: ConnectorTool[]) => Promise<OllamaChatResponse>; dispatch: (n: string, a: unknown) => Promise<unknown> },
  ) => Promise<ChatMessage[]>;
  callOllama: (messages: ChatMessage[], tools: ConnectorTool[]) => Promise<OllamaChatResponse>;
  dispatch: (name: string, args: unknown) => Promise<unknown>;
  tools: ConnectorTool[];
};

export async function runAgentNode(node: WfAgentNode, ctx: RunContext, deps: AgentDeps): Promise<unknown> {
  // resolveTemplate(text) = total→string (PIN-D3a, CTO 06-05) → dùng thẳng, KHÔNG branch type.
  const userPrompt = resolveTemplate(node.prompt, ctx, "text") as string;
  const messages: ChatMessage[] = [
    { role: "system", content: node.system ?? DEFAULT_AGENT_SYSTEM },
    { role: "user", content: userPrompt },
  ];
  const convo = await deps.runRounds(messages, deps.tools, { callOllama: deps.callOllama, dispatch: deps.dispatch });
  // runToolRounds break KHÔNG push câu trả lời cuối → 1 call no-tools lấy text (như /api/chat).
  const final = await deps.callOllama(convo, []);
  return final?.message?.content ?? "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workflow/executors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/executors.ts src/lib/workflow/executors.test.ts
git commit -m "feat(workflow): A0 node executors (connector + agent)"
```

---

## Task 6: Engine (`engine.ts`)

**Files:**
- Create: `src/lib/workflow/engine.ts`
- Test: `src/lib/workflow/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workflow/engine.test.ts
import { describe, expect, test, vi } from "vitest";
import { runWorkflow } from "./engine";
import { emptyContext } from "./types";
import type { WorkflowGraph, StepRecord } from "./types";

const chain: WorkflowGraph = {
  nodes: [
    { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
    { id: "n2", kind: "agent", prompt: "Tóm tắt {{steps.n1.output.count}}." },
  ],
  edges: [{ from: "n1", to: "n2" }],
};

describe("runWorkflow (linear)", () => {
  test("chạy đúng thứ tự, truyền context, succeeded", async () => {
    const steps: StepRecord[] = [];
    const runNode = vi.fn(async (node) => (node.id === "n1" ? { count: 2 } : "OK"));
    const r = await runWorkflow(chain, { runNode, onStep: async (s) => { steps.push({ ...s }); } }, emptyContext({}));
    expect(r.status).toBe("succeeded");
    expect(runNode.mock.calls.map((c) => c[0].id)).toEqual(["n1", "n2"]);
    expect(r.context.steps["n1"].output).toEqual({ count: 2 });
    expect(r.context.steps["n2"].output).toBe("OK");
    // onStep: mỗi node running→succeeded
    expect(steps.map((s) => `${s.nodeId}:${s.status}`)).toEqual(["n1:running", "n1:succeeded", "n2:running", "n2:succeeded"]);
    expect(steps[0].seq).toBe(0);
    expect(steps[2].seq).toBe(1);
  });

  test("node lỗi → fail-stop, node sau KHÔNG chạy", async () => {
    const calls: string[] = [];
    const runNode = vi.fn(async (node) => { calls.push(node.id); if (node.id === "n1") throw new Error("boom"); return "x"; });
    const r = await runWorkflow(chain, { runNode, onStep: async () => {} }, emptyContext({}));
    expect(r.status).toBe("failed");
    expect(r.failedNodeId).toBe("n1");
    expect(r.error).toMatch(/boom/);
    expect(calls).toEqual(["n1"]); // n2 không chạy
  });

  test("graph branch → throw (validate gate)", async () => {
    const branch: WorkflowGraph = {
      nodes: [...chain.nodes, { id: "n3", kind: "agent", prompt: "y" }],
      edges: [{ from: "n1", to: "n2" }, { from: "n1", to: "n3" }],
    };
    await expect(runWorkflow(branch, { runNode: vi.fn(), onStep: async () => {} }, emptyContext({}))).rejects.toThrow(/branch|nhánh/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workflow/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 3: Write `engine.ts`**

```ts
// src/lib/workflow/engine.ts
// Bộ điều phối THUẦN: duyệt chain tuyến tính, gọi runNode (DI), truyền blackboard,
// phát StepRecord qua onStep, fail-stop. Validate trước khi chạy (spec §5.4/§5.5).
import type { WorkflowGraph, RunContext, StepRecord, WfNode } from "./types";
import { linearOrder } from "./validate";

export type EngineDeps = {
  runNode: (node: WfNode, ctx: RunContext) => Promise<unknown>;
  onStep: (step: StepRecord) => Promise<void>;
};

export type EngineResult = {
  status: "succeeded" | "failed";
  context: RunContext;
  failedNodeId?: string;
  error?: string;
};

export async function runWorkflow(graph: WorkflowGraph, deps: EngineDeps, ctx0: RunContext): Promise<EngineResult> {
  const order = linearOrder(graph); // throw nếu non-linear/cycle (cổng A0)
  const ctx = ctx0;
  let seq = 0;
  for (const node of order) {
    const base = { nodeId: node.id, kind: node.kind, seq };
    await deps.onStep({ ...base, status: "running" });
    try {
      const output = await deps.runNode(node, ctx);
      ctx.steps[node.id] = { output };
      await deps.onStep({ ...base, status: "succeeded", output });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await deps.onStep({ ...base, status: "failed", error });
      return { status: "failed", context: ctx, failedNodeId: node.id, error };
    }
    seq++;
  }
  return { status: "succeeded", context: ctx };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workflow/engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/engine.ts src/lib/workflow/engine.test.ts
git commit -m "feat(workflow): A0 linear engine (fail-stop, blackboard, onStep)"
```

---

## Task 7: Ollama helper + Run layer + API routes

### 7a. `ollama.ts` (fetch wrapper, tách để test route khỏi mạng)

**Files:**
- Create: `src/lib/workflow/ollama.ts`

- [ ] **Step 1: Write `ollama.ts`** (không test riêng — wrapper mạng thuần, exercise ở E2E)

```ts
// src/lib/workflow/ollama.ts
// Một call /api/chat non-streaming. Mirror payload của /api/chat route.
import type { ChatMessage, OllamaChatResponse } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = process.env.DEFAULT_CHAT_MODEL ?? "gemma4:e4b";
const NUM_CTX = Math.max(2048, Number(process.env.CHAT_NUM_CTX) || 16384);

export async function callOllamaChat(messages: ChatMessage[], tools: ConnectorTool[]): Promise<OllamaChatResponse> {
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(tools.length ? { tools } : {}),
      options: { num_ctx: NUM_CTX },
      stream: false,
    }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  return (await r.json()) as OllamaChatResponse;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/workflow/ollama.ts
git commit -m "feat(workflow): A0 ollama call helper"
```

### 7b. `run.ts` (persist + SSE quanh engine)

**Files:**
- Create: `src/lib/workflow/run.ts`
- Test: `src/lib/workflow/run.test.ts`

- [ ] **Step 1: Write the failing test** (mock db + bus + buildRunNode)

```ts
// src/lib/workflow/run.test.ts
import { describe, expect, test, vi } from "vitest";
import { executeRun } from "./run";
import type { WorkflowGraph } from "./types";

const graph: WorkflowGraph = {
  nodes: [
    { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
    { id: "n2", kind: "agent", prompt: "Tóm tắt {{steps.n1.output.count}}." },
  ],
  edges: [{ from: "n1", to: "n2" }],
};

function fakeDb(workflowRow: unknown) {
  const inserted: Record<string, unknown[]> = {};
  const updated: unknown[] = [];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (workflowRow ? [workflowRow] : []) }) }) }),
    insert: (table: { _: { name?: string } }) => ({
      values: async (v: unknown) => { (inserted[String((table as any)[Symbol.for("drizzle:Name")] ?? "t")] ||= []).push(v); },
    }),
    update: () => ({ set: (v: unknown) => ({ where: async () => { updated.push(v); } }) }),
  };
  return { db, inserted, updated };
}

describe("executeRun", () => {
  test("404 nếu workflow không thuộc user", async () => {
    const { db } = fakeDb(null);
    const publish = vi.fn();
    const r = await executeRun({ workflowId: "w1", userId: "u1", trigger: "manual" }, { db: db as any, publish, buildRunNode: () => vi.fn() });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });

  test("chạy → snapshot + run row + step rows + SSE + status succeeded", async () => {
    const { db, updated } = fakeDb({ id: "w1", userId: "u1", graph });
    const publish = vi.fn();
    const buildRunNode = () => vi.fn(async (node: { id: string }) => (node.id === "n1" ? { count: 2 } : "Tóm tắt xong."));
    const r = await executeRun({ workflowId: "w1", userId: "u1", trigger: "manual" }, { db: db as any, publish, buildRunNode });
    expect(r.ok).toBe(true);
    expect(r.run.status).toBe("succeeded");
    expect(r.steps.map((s) => s.nodeId)).toEqual(["n1", "n2"]);
    // SSE: ít nhất 1 publish cho step + 1 cho run xong
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: "workflow_run_step", nodeId: "n1" }));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: "workflow_run", status: "succeeded" }));
    // run cập nhật status cuối
    expect(updated.some((u: any) => u.status === "succeeded")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workflow/run.test.ts`
Expected: FAIL — `Cannot find module './run'`.

- [ ] **Step 3: Write `run.ts`**

```ts
// src/lib/workflow/run.ts
// Lớp persistence + SSE quanh engine thuần. Snapshot graph authored vào run
// (PIN-D4a). Mỗi step → row + publish bus. status cuối + context (capped).
import { eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { workflows, workflowRuns, workflowRunSteps } from "@/db/schema";
import type { BusEvent } from "@/lib/events-bus";
import { runWorkflow } from "./engine";
import { emptyContext } from "./types";
import type { RunContext, StepRecord, WfNode } from "./types";

const MAX_OUTPUT_BYTES = 256 * 1024; // PIN-D4b — cap output persist, KHÔNG cắt context RAM

function capForPersist(v: unknown): unknown {
  try {
    const s = JSON.stringify(v);
    if (s.length > MAX_OUTPUT_BYTES) return { _truncated: true, bytes: s.length, preview: s.slice(0, 1000) };
  } catch { /* non-serializable */ }
  return v;
}

export type ExecuteRunDeps = {
  db: typeof Db;
  publish: (e: BusEvent) => void;
  buildRunNode: (userId: string) => (node: WfNode, ctx: RunContext) => Promise<unknown>;
};

export type ExecuteRunResult =
  | { ok: false; status: number; error: string }
  | { ok: true; run: { id: string; status: string }; steps: StepRecord[] };

export async function executeRun(
  input: { workflowId: string; userId: string; trigger: "manual" | "schedule" },
  deps: ExecuteRunDeps,
): Promise<ExecuteRunResult> {
  const rows = await deps.db.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1);
  const wf = rows[0];
  if (!wf || wf.userId !== input.userId) return { ok: false, status: 404, error: "không tìm thấy workflow" };

  const runId = crypto.randomUUID();
  const snapshot = wf.graph; // PIN-D4a: kế hoạch authored, tĩnh
  await deps.db.insert(workflowRuns).values({
    id: runId,
    workflowId: wf.id,
    userId: input.userId,
    trigger: input.trigger,
    status: "running",
    graphSnapshot: snapshot,
    startedAt: new Date(),
  });

  const steps: StepRecord[] = [];
  const stepRowId = new Map<string, string>(); // nodeId → row id (A0: nodeId duy nhất trong 1 run)
  const onStep = async (s: StepRecord) => {
    if (s.status === "running") {
      const id = crypto.randomUUID();
      stepRowId.set(s.nodeId, id);
      await deps.db.insert(workflowRunSteps).values({
        id, runId, nodeId: s.nodeId, seq: s.seq, kind: s.kind, status: "running", startedAt: new Date(),
      });
    } else {
      steps.push(s);
      // Update ĐÚNG row của node này (theo id) — KHÔNG where(runId) (sẽ clobber mọi step).
      await deps.db.update(workflowRunSteps)
        .set({ status: s.status, output: capForPersist(s.output), error: s.error, finishedAt: new Date() })
        .where(eq(workflowRunSteps.id, stepRowId.get(s.nodeId)!));
    }
    deps.publish({ type: "workflow_run_step", runId, nodeId: s.nodeId, seq: s.seq, status: s.status });
  };

  const runNode = deps.buildRunNode(input.userId);
  const result = await runWorkflow(snapshot, { runNode, onStep }, emptyContext({ source: input.trigger }));

  await deps.db.update(workflowRuns)
    .set({
      status: result.status,
      error: result.error,
      context: capForPersist(result.context),
      finishedAt: new Date(),
    })
    .where(eq(workflowRuns.id, runId));
  deps.publish({ type: "workflow_run", runId, status: result.status });

  return { ok: true, run: { id: runId, status: result.status }, steps };
}
```

> Note A0: `onStep` update ĐÚNG row theo `stepRowId` map (nodeId→id) — nodeId duy nhất trong 1 run tuyến tính. (Bản đầu dùng `where(runId)` → clobber mọi step; đã vá.) A1 (foreach lặp cùng nodeId) khoá row-id theo iteration. Unit test per-row update = follow-up; E2E Task 8 phủ row-correctness cho A0.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workflow/run.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/run.ts src/lib/workflow/run.test.ts
git commit -m "feat(workflow): A0 run layer — snapshot + persist steps + SSE"
```

### 7c. API routes (create/seed + manual run)

**Files:**
- Create: `src/app/api/workflows/route.ts`
- Create: `src/app/api/workflows/[id]/run/route.ts`

- [ ] **Step 1: Write `src/app/api/workflows/route.ts`** (POST create/seed, GET list)

```ts
// src/app/api/workflows/route.ts
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { assertLinear } from "@/lib/workflow/validate";
import type { WorkflowGraph } from "@/lib/workflow/types";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const body = ((await req.json().catch(() => null)) ?? {}) as { name?: string; graph?: WorkflowGraph };
  if (!body.name || !body.graph) return new Response(JSON.stringify({ error: "name + graph bắt buộc" }), { status: 400 });
  try {
    assertLinear(body.graph); // A0: chỉ nhận graph tuyến tính (cổng §5.5)
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "graph không hợp lệ" }), { status: 400 });
  }
  const id = crypto.randomUUID();
  await db.insert(workflows).values({ id, userId: session.user.id, name: body.name, graph: body.graph, status: "active" });
  return new Response(JSON.stringify({ id }), { status: 201, headers: { "content-type": "application/json" } });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const rows = await db.select().from(workflows).where(eq(workflows.userId, session.user.id)).orderBy(desc(workflows.createdAt));
  return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json" } });
}
```

- [ ] **Step 2: Write `src/app/api/workflows/[id]/run/route.ts`** (POST manual trigger)

```ts
// src/app/api/workflows/[id]/run/route.ts
import { auth } from "@/auth";
import { db } from "@/db";
import { publish } from "@/lib/events-bus";
import { executeRun } from "@/lib/workflow/run";
import { runToolRounds } from "@/lib/agent/orchestrator";
import { INTERNAL_TOOLS, modelToolSchemas, makeDispatch } from "@/lib/agent/registry";
import { withSafety } from "@/lib/agent/safety/gate";
import { execute as connectorExecute } from "@/lib/connectors";
import { callOllamaChat } from "@/lib/workflow/ollama";
import { runAgentNode, runConnectorNode } from "@/lib/workflow/executors";
import type { RunContext, WfNode } from "@/lib/workflow/types";

// Wire executors với runtime thật (closure userId). Agent node A0 = read-only:
// tool union chỉ internal read tools; withSafety bọc dispatch (write → throw).
function buildRunNode(userId: string) {
  const tools = modelToolSchemas(INTERNAL_TOOLS, []); // A0: internal read tools only
  return (node: WfNode, ctx: RunContext) => {
    if (node.kind === "connector") {
      return runConnectorNode(node, ctx, { execute: (action, args) => connectorExecute(userId, action, args) });
    }
    const dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now: Date.now(), lang: "vi" }), { internal: INTERNAL_TOOLS });
    return runAgentNode(node, ctx, { runRounds: runToolRounds, callOllama: callOllamaChat, dispatch, tools });
  };
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const { id } = await params;
  const result = await executeRun({ workflowId: id, userId: session.user.id, trigger: "manual" }, { db, publish, buildRunNode });
  if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: result.status });
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
}
```

- [ ] **Step 3: Verify tsc + full suite sạch**

Run: `npx tsc --noEmit && npx vitest run src/lib/workflow`
Expected: tsc exit 0; tất cả test workflow PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/workflows
git commit -m "feat(workflow): A0 API — create/seed + manual run"
```

---

## Task 8: E2E host smoke (user-run) + success criteria

> ⛔ agent-ops: agent KHÔNG chạy dev/build/Ollama ngầm. **User chạy trên host** (đã có Postgres + Ollama + login). Đây là nghiệm thu A0.

- [ ] **Step 1: Bật connector demo cho user** (qua UI `/connectors` → Demo → Connect, hoặc API).

- [ ] **Step 2: Seed workflow demo** (1 connector → 1 agent)

```bash
# Thay <COOKIE> bằng session cookie sau khi login.
curl -s -X POST http://localhost:3100/api/workflows -H "content-type: application/json" -H "cookie: <COOKIE>" -d '{
  "name": "A0 demo — tóm tắt task",
  "graph": {
    "nodes": [
      { "id": "n1", "kind": "connector", "connectorId": "demo", "action": "demo_list_tasks", "args": {} },
      { "id": "n2", "kind": "agent", "system": "Bạn tóm tắt danh sách công việc bằng 1 câu tiếng Việt.", "prompt": "Tóm tắt các công việc sau: {{steps.n1.output}}" }
    ],
    "edges": [{ "from": "n1", "to": "n2" }]
  }
}'
# → {"id":"<WF_ID>"}
```

- [ ] **Step 2b: (tuỳ) mở SSE để xem realtime**

```bash
curl -N http://localhost:3100/api/events -H "cookie: <COOKIE>"   # quan sát workflow_run_step / workflow_run
```

- [ ] **Step 3: Chạy workflow**

```bash
curl -s -X POST http://localhost:3100/api/workflows/<WF_ID>/run -H "cookie: <COOKIE>"
```

- [ ] **Step 4: Verify success criteria (spec §11 A0)**

Expected (`result.ok === true`):
- `run.status === "succeeded"`.
- `steps` có 2 phần tử: `n1` (connector, output = list demo tasks), `n2` (agent, output = câu tóm tắt tiếng Việt).
- SSE (Step 2b) đã phát `workflow_run_step` cho n1+n2 và `workflow_run` succeeded.
- DB: `select status, jsonb_array_length(...) from workflow_run` có 1 run; `workflow_run_step` có 2 row; `workflow_run.graphSnapshot` = graph đã seed.
- **PIN-D3a kiểm chứng:** sửa graph cho 1 connector arg dùng sole-token số (vd seed thêm node `demo_create_task` với `"args":{"title":"{{steps.n1.output.0.title}}"}` *không* dùng — thay vào đó chạy unit test Task 3 đã phủ: sole-token number giữ type). Unit test là bằng chứng chính; E2E xác nhận luồng.

- [ ] **Step 5: Ghi checkpoint + cập nhật Serena** (`.serena/checkpoint/`, service memory nếu cần).

---

## Self-Review (đã chạy)

**1. Spec coverage (A0 phần của §9):** manual trigger ✓ (Task 7c) · chain tuyến tính ✓ (engine Task 6 + validate Task 4) · 1 agent + 1 connector ✓ (executors Task 5) · run + run_step ✓ (schema Task 2 + run Task 7b) · SSE ✓ (publish trong run.ts) · seed qua API, no editor ✓ (Task 7c POST). PIN-D3a ✓ (Task 3, test đầu tiên). PIN-D4a snapshot ✓ (run.ts). PIN-D4b cap-persist-không-cắt-RAM ✓ (`capForPersist` chỉ ở persist, `ctx.steps` RAM nguyên). validateGraph cổng ✓ (Task 4, dùng ở engine + create route). #3 agent read-only ✓ (buildRunNode: internal read tools + withSafety).

**2. Placeholder scan:** không TBD/TODO; mọi step có code/command + expected.

**3. Type consistency:** `WorkflowGraph`/`RunContext`/`StepRecord` (types.ts) dùng nhất quán; `runToolRounds(messages, tools, {callOllama, dispatch})` khớp orchestrator.ts; `execute(userId, action, args)` khớp connectors/index.ts; `publish(BusEvent)` khớp events-bus.ts; `withSafety(makeDispatch(INTERNAL_TOOLS, ctx), {internal})` khớp route + gate.ts.

**Out-of-scope A0 (ghi nhớ phase sau):** `db.update(workflowRunSteps).where(runId)` đơn giản hoá (A1 khoá theo seq); token/cost rollup chưa tính (luôn 0 ở A0 — Ollama non-streaming trong runRounds chưa thu eval_count; thêm ở A2 cùng bounding); agent node chưa stream trace frames (workflow context không cần SP-4 frames, output đủ).
