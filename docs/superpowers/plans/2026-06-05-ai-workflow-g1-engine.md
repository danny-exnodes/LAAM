# AI Workflow — G1 Engine v2 (condition + foreach + bounding + A1 follow-ups) Plan

> **For agentic workers:** execute task-by-task via subagent-driven-development. TDD; tests are the precise behavioral spec.

**Goal:** Generalize the A0 linear engine into a **branching + looping** engine: `condition` nodes (predicate → labeled edge), `foreach` nodes (iterate a sub-graph body), run-level bounding, and the A1 follow-ups (populate `run_step.input`, finalize run status on error). Backend only — no UI.

**Branch:** `feat/wf-engine` (worktree, base = local main HEAD with A0).

**Design decisions (autonomous, for review):**
- **condition** branches do NOT reconverge (tree, no fan-in) — DAG/merge deferred. Edges carry `label`; condition node has exactly `true`+`false` out-edges.
- **foreach** body is a nested `WorkflowGraph` (cleaner than loop-end markers); engine recurses `runWorkflow(body)` per item with `item`/`index` in `ctx.vars`; children get `parentStepId`.
- **Bounding** = `maxSteps` + `maxForeachItems` caps (sound runaway guard). Token-precise budgeting deferred (would change runNode's `unknown` return contract from A0). Documented simplification.
- **Predicate** = comparator (`eq/ne/gt/lt/gte/lte/contains/not_contains/exists/not_exists`) + `all`/`any`; operands resolved with **arg-sink** semantics (type-preserving, fail-loud on embedded-object) reusing `resolveTemplate`.
- A0 contracts preserved: `runNode(node,ctx)→Promise<unknown>` unchanged; agent/connector executors unchanged; engine adds condition/foreach handling internally.

---

## File Structure
| File | Change |
|---|---|
| `src/lib/workflow/types.ts` | +condition/foreach kinds, `Predicate`, `Comparator`, `Op`, `WfEdge.label`, `Budget`, `StepRecord.input` already exists |
| `src/lib/workflow/predicate.ts` (new) | `evalPredicate(pred, ctx): boolean` |
| `src/lib/workflow/validate.ts` | v2: allow condition true/false branching + foreach body recursion; keep 1-start/no-cycle/no-fan-in |
| `src/lib/workflow/engine.ts` | v2: recursive walker (agent/connector via runNode; condition branch; foreach loop) + budget |
| `src/lib/workflow/run.ts` | populate `run_step.input`; foreach child steps (`parentStepId`); finalize run on engine throw (budget/validate) |

---

## Task 1: Types — condition/foreach/predicate/edge-label/budget

**Files:** `src/lib/workflow/types.ts` (modify), `types.test.ts` (extend)

- [ ] **Step 1: extend `types.test.ts`** — add a `describe("workflow v2 types")` asserting a condition+foreach graph compiles:
```ts
import type { WorkflowGraph, Predicate, Budget } from "./types";
test("v2 graph: foreach + condition compiles", () => {
  const pred: Predicate = { all: [{ left: "{{steps.a.output.n}}", op: "gt", right: 0 }] };
  const g: WorkflowGraph = {
    nodes: [
      { id: "loop", kind: "foreach", items: "{{steps.fetch.output}}", body: { nodes: [{ id: "b1", kind: "agent", prompt: "x {{vars.item}}" }], edges: [] } },
      { id: "c", kind: "condition", when: pred },
    ],
    edges: [{ from: "loop", to: "c" }, { from: "c", to: "loop", label: "false" }],
  };
  expect(g.nodes).toHaveLength(2);
});
const _b: Budget = { maxSteps: 100, maxForeachItems: 50 };
```
(Note: the edge `c→loop label:false` above is just a type smoke; validate rejects cycles — fine, this test only checks the TYPES compile, not validity.)

- [ ] **Step 2: run → fail; Step 3: extend `types.ts`:**
```ts
export type WfNodeKind = "agent" | "connector" | "condition" | "foreach";

export type Op = "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains" | "not_contains" | "exists" | "not_exists";
export type Comparator = { left: string; op: Op; right?: unknown };
export type Predicate = Comparator | { all: Predicate[] } | { any: Predicate[] };

export type WfConditionNode = { id: string; kind: "condition"; when: Predicate };
export type WfForeachNode = { id: string; kind: "foreach"; items: string; body: WorkflowGraph };
// (keep WfAgentNode, WfConnectorNode as in A0)
export type WfNode = WfAgentNode | WfConnectorNode | WfConditionNode | WfForeachNode;
export type WfEdge = { from: string; to: string; label?: string }; // label for condition branches

export type Budget = { maxSteps: number; maxForeachItems: number };
export const DEFAULT_BUDGET: Budget = { maxSteps: 200, maxForeachItems: 100 };
```
(`StepRecord.input?` already exists from A0 — keep.) Keep `RunContext`; add `item`/`index` go in `vars` at runtime (no type change needed — vars is `Record<string,unknown>`).
- [ ] **Step 4-5:** run → pass; commit `feat(workflow): G1 types — condition/foreach/predicate/budget`.

---

## Task 2: Predicate evaluator (`predicate.ts`)

**Files:** `src/lib/workflow/predicate.ts` (new) + test. TDD.

**Behavioral spec (the test IS the spec — implementer writes code to pass):**
- `evalPredicate(pred, ctx): boolean`.
- Comparator: resolve `left` via `resolveTemplate(left, ctx, "arg")` (type-preserving, throws on embedded-object/missing). `right` may be a literal OR a `{{template}}` string → if string containing `{{`, resolve it too (arg-sink); else use as literal.
- Ops on resolved `l`, `r`: `eq`(`===` with deep-equal for arrays/objects via JSON), `ne`, `gt/lt/gte/lte` (numeric/string compare), `contains` (string→substring, array→membership), `not_contains`, `exists` (`l != null`), `not_exists`.
- `{all:[...]}` → every sub-predicate true; `{any:[...]}` → some true. Recurse.

- [ ] **Step 1: write `predicate.test.ts`** covering:
```ts
import { describe, expect, test } from "vitest";
import { evalPredicate } from "./predicate";
import { emptyContext } from "./types";
const ctx = (o: unknown) => { const c = emptyContext({}); c.steps["a"] = { output: o }; return c; };

test("gt numeric", () => expect(evalPredicate({ left: "{{steps.a.output.n}}", op: "gt", right: 5 }, ctx({ n: 9 }))).toBe(true));
test("eq string", () => expect(evalPredicate({ left: "{{steps.a.output.s}}", op: "eq", right: "bug" }, ctx({ s: "bug" }))).toBe(true));
test("contains array membership", () => expect(evalPredicate({ left: "{{steps.a.output.tags}}", op: "contains", right: "x" }, ctx({ tags: ["x", "y"] }))).toBe(true));
test("contains string substring", () => expect(evalPredicate({ left: "{{steps.a.output.t}}", op: "contains", right: "ug" }, ctx({ t: "bug" }))).toBe(true));
test("exists", () => expect(evalPredicate({ left: "{{steps.a.output.maybe}}", op: "exists" }, ctx({ maybe: 0 }))).toBe(true));
test("not_exists on missing → true", () => expect(evalPredicate({ left: "{{steps.a.output.nope}}", op: "not_exists" }, ctx({}))).toBe(true));
test("all = AND", () => expect(evalPredicate({ all: [{ left: "{{steps.a.output.n}}", op: "gt", right: 1 }, { left: "{{steps.a.output.n}}", op: "lt", right: 10 }] }, ctx({ n: 5 }))).toBe(true));
test("any = OR", () => expect(evalPredicate({ any: [{ left: "{{steps.a.output.n}}", op: "eq", right: 1 }, { left: "{{steps.a.output.n}}", op: "eq", right: 5 }] }, ctx({ n: 5 }))).toBe(true));
test("right as template", () => expect(evalPredicate({ left: "{{steps.a.output.x}}", op: "eq", right: "{{steps.a.output.y}}" }, ctx({ x: 3, y: 3 }))).toBe(true));
```
> NOTE for `exists`/`not_exists`: `left` resolution must NOT throw on missing — for these two ops, catch the missing-path and treat as "not exists". Implement accordingly (the only ops where a missing path is valid input).
- [ ] **Step 2-5:** fail → implement `predicate.ts` → pass → commit `feat(workflow): G1 predicate evaluator`.

---

## Task 3: validate v2 (`validate.ts`)

**Behavioral spec:** extend `assertLinear` → rename intent to `assertRunnable` (keep `assertLinear` as alias OR replace usages). Rules:
- 1 start (no in-edge); all edges reference existing nodes; ≤1 in-edge per node (no fan-in/merge); no cycle on any walk path.
- A `condition` node MUST have exactly 2 out-edges, labeled `"true"` and `"false"`. Every other node ≤1 out-edge (unlabeled).
- A `foreach` node's `body` is validated recursively (same rules).
- `linearOrder` is removed/deprecated (engine now walks, not flat-orders). The create route + engine call the validator, not linearOrder.

- [ ] Tests (`validate.test.ts` extend): keep A0 linear tests passing (a linear chain is still valid); ADD: condition with true+false edges = valid; condition with 1 edge = throw; non-condition node with 2 out-edges = throw (`/branch/`); foreach with invalid body = throw; cycle through condition branch = throw.
- [ ] Implement → keep A0 tests green → commit `feat(workflow): G1 validate v2 (condition branch + foreach body)`.

> **Coordination note:** `engine.ts` (Task 4) currently imports `linearOrder`. If you remove it, update engine import in the SAME task or stub it. Prefer: keep a `walkPlan`/validator export the engine uses. Implementer: coordinate with Task 4's needs — if unsure, keep `linearOrder` working for pure-linear and add new validation for branches.

---

## Task 4: Engine v2 (`engine.ts`) — recursive walker + budget

**Behavioral spec (tests are the contract):**
- `runWorkflow(graph, deps, ctx, budget=DEFAULT_BUDGET): EngineResult`. `deps = { runNode, onStep, evalPredicate }` (evalPredicate injected for testability).
- Validate first (throws → propagates; run layer catches).
- Walk from the start node following edges. Per node, increment a step counter; if `steps > budget.maxSteps` → throw `Error("budget: max steps exceeded")`.
- `agent`/`connector`: `output = await deps.runNode(node, ctx)`; `ctx.steps[id] = { output }`; follow the single out-edge.
- `condition`: `result = deps.evalPredicate(node.when, ctx)`; `ctx.steps[id] = { output: result }`; follow the out-edge whose `label === String(result)` (`"true"`/`"false"`). If no matching labeled edge → end.
- `foreach`: resolve `items` via `resolveTemplate(node.items, ctx, "arg")` → must be an array (else throw); if `items.length > budget.maxForeachItems` → throw `budget: max foreach items`. For each `(index,item)`: build `subCtx` = same `ctx` but `vars` extended `{...ctx.vars, item, index}` (share `steps`? — NO: give the body a fresh `steps:{}` per iteration so body nodes are isolated, but it can read `vars.item`); run `await runWorkflow(node.body, deps, subCtx, budget)` (recurse, SHARED budget + counter — pass the counter by ref via a mutable budget-state object). Collect each iteration's terminal output. `ctx.steps[id] = { output: <array of iteration outputs> }`. Follow foreach's single out-edge.
- `onStep` emitted running→succeeded/failed per node as in A0. For foreach iterations, body steps emit with their own records; the run layer assigns `parentStepId` (Task 5). The engine passes a `parentStepId`/`path` hint to `onStep` so the run layer can nest — add an optional `parentNodeId?` field to the `onStep` StepRecord for foreach children.
- fail-stop unchanged: a node throw → onStep(failed) + return `{status:"failed", failedNodeId, error}`.

- [ ] Tests (`engine.test.ts` extend; keep A0 tests green): 
  - condition true-branch taken; false-branch taken (mock evalPredicate).
  - foreach over `[a,b]` runs body twice with `vars.item` = a then b (assert via a runNode spy capturing `ctx.vars.item`); output = array of 2.
  - budget.maxSteps exceeded → throws `/budget/`.
  - budget.maxForeachItems exceeded → throws `/foreach/`.
  - foreach items not array → throws.
- [ ] Implement → all green → commit `feat(workflow): G1 engine v2 (condition + foreach + budget)`.

> Implementer: the shared step-counter across foreach recursion needs a mutable holder (e.g. `const state = { steps: 0 }` threaded into the recursion, NOT a local `let`). Design it so the cap counts ALL node executions across nested bodies.

---

## Task 5: run.ts — input population + foreach children + finalize-on-error

**Behavioral spec:**
- Populate `run_step.input`: when emitting a step, the run layer records the node's resolved input. Since executors interpolate internally, the cleanest: the engine's `onStep(running)` includes `input` = a shallow descriptor (for agent: the resolved prompt; connector: resolved args; condition: the predicate; foreach: items count). To get resolved values without duplicating interpolation, have the engine compute & pass `input` in the running StepRecord (engine has ctx; it can resolve a preview). **Simplest sound approach:** engine includes in the running StepRecord an `input` = for connector `interpolateArgs(node.args,ctx)`, for agent `resolveTemplate(node.prompt,ctx,"text")`, for condition `node.when`, for foreach `{count: items.length}`. (Engine imports interpolate/resolveTemplate — acceptable.)
- foreach children: the run layer sets `parentStepId` on step rows that carry a `parentNodeId` (from the engine's onStep). Map parentNodeId → that node's stepRowId.
- **A1 follow-up — finalize on engine throw:** wrap `runWorkflow` in try/catch in `executeRun`; on throw (budget/validate/foreach-not-array), set the run row `status:"failed"` + `error` + `finishedAt` (currently a throw would leave the run "running"). Publish `workflow_run failed`.
- A1 follow-up — `onStep('running')` insert failure: wrap each onStep DB write in try/catch (fail-soft, log) so a transient insert error doesn't abort the whole run silently; but a node failure still fail-stops via the engine.

- [ ] Tests (`run.test.ts` extend): engine-throw (e.g. budget) → run finalized `failed` (not stuck running) + SSE `workflow_run failed`; `run_step.input` populated for a connector node; foreach child step gets `parentStepId`.
- [ ] Implement → green → commit `feat(workflow): G1 run layer — input + foreach children + finalize-on-error`.

---

## Task 6: Verify + integrate
- [ ] `npx tsc --noEmit` (0) + `npx vitest run src/lib/workflow` (all green, incl. A0 tests still passing).
- [ ] Update the create route (`api/workflows/route.ts`) if it called `linearOrder`/`assertLinear` — point to the v2 validator so condition/foreach graphs can be created.
- [ ] Commit any integration fixes.

## Self-review
- A0 contracts intact (runNode/executors unchanged)? condition no-reconverge documented? foreach budget enforced? run finalizes on throw? tsc 0 + suite green incl. A0?
