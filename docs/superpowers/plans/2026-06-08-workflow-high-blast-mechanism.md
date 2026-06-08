# Workflow HIGH-blast — Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `BLAST_LOW`-only workflow write-gate with a self-declared, fail-closed `workflowSafe` flag (registry-derived), and make dry-run preview un-cleared writes while real-run enforces the gate.

**Architecture:** A connector tool self-declares `workflowSafe?: boolean` (absent = false = fail-closed). `policy.ts` derives the safe-set from the `CONNECTORS` registry (same idiom as `kind`). The workflow gate `assertConnectorAllowed` throws on a write that isn't workflow-safe. In `runtime.ts`, the gate runs only on **real** runs (default); **dry-run** skips the throw and mocks writes (so an un-cleared write can be previewed but never executes — security-critical seam).

**Tech Stack:** TypeScript, Vitest. No DB migration, no new routes, no new deps.

**Scope:** Mechanism ONLY. This plan ships fail-closed — only `demo_create_task` stays enabled (preserving today's behavior). NOT in this plan: flipping the 8 tier-low tools (config step after merge + CTO confirm on gdrive/gcal), the gmail destination-control gate (separate design), and the manual dry-run-default UX (separate slice — spec §11). Spec: `docs/superpowers/specs/2026-06-08-workflow-high-blast-design.md`.

**Execution note:** Implement in an isolated git worktree (shared-workspace rule — invoke `superpowers:using-git-worktrees` first). The resulting PR REQUIRES a security-review of the Task 3 dry-run seam (CTO directive).

---

### Task 1: Readiness flag foundation (type + demo + policy)

**Files:**
- Modify: `src/lib/connectors/types.ts:28-35` (add field to `ConnectorTool`)
- Modify: `src/lib/connectors/demo.ts:32-46` (declare flag on `demo_create_task`)
- Modify: `src/lib/agent/safety/policy.ts:33-45` (replace `BLAST_LOW`/`resolveBlast` with `WORKFLOW_SAFE`/`isWorkflowSafe`)
- Test: `src/lib/agent/safety/policy.test.ts:2,62-75` (replace `resolveBlast` block)

- [ ] **Step 1: Rewrite the policy test block (failing test)**

In `src/lib/agent/safety/policy.test.ts`, change the import on line 2 from:
```ts
import { resolveKind, resolveBlast, BLAST_LOW } from "./policy";
```
to:
```ts
import { resolveKind, isWorkflowSafe } from "./policy";
```

Replace the entire `describe("resolveBlast ...")` block (lines 62-75) with:
```ts
describe("isWorkflowSafe (workflow-readiness — fail-closed default)", () => {
  test("demo_create_task = true (đã khai workflowSafe)", () => {
    expect(isWorkflowSafe("demo_create_task")).toBe(true);
  });
  test("default fail-closed: write chưa khai cờ → false", () => {
    // LOAD-BEARING: test này phải FAIL nếu ai đó default cờ = true cho tool chưa clear.
    expect(isWorkflowSafe("trello_create_card")).toBe(false);
  });
  test("tool lạ → false (fail-closed)", () => {
    expect(isWorkflowSafe("anything_else")).toBe(false);
  });
  test("đúng tập workflowSafe (v1 = chỉ demo) — tripwire: chưa flip tool nào", () => {
    // Khi flip tier-low (sau merge), cập nhật list này MỘT CÁCH CÓ Ý — như audit test write-surface.
    const safe = CONNECTORS.flatMap((c) =>
      c.tools.filter((t) => t.workflowSafe).map((t) => t.function.name),
    ).sort();
    expect(safe).toEqual(["demo_create_task"]);
  });
});
```
Also update the stale comment in the `resolveKind` block (line 41-42) — change `and are HIGH blast (not in BLAST_LOW)` to `and are not yet workflowSafe (fail-closed in workflow runs)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/safety/policy.test.ts`
Expected: FAIL — `isWorkflowSafe` is not exported (and `resolveBlast`/`BLAST_LOW` import removed).

- [ ] **Step 3: Add the type field**

In `src/lib/connectors/types.ts`, in the `ConnectorTool` type (after the `kind` field, line 33), add:
```ts
  // Eval-readiness for workflow autonomy. ABSENT = false = fail-closed: the tool may
  // NOT run in a workflow run until explicitly flipped (tier-low after merge; tier-high
  // after a destination-control gate). Orthogonal to kind: reads aren't gated by this.
  workflowSafe?: boolean;
```

- [ ] **Step 4: Declare the flag on the demo write**

In `src/lib/connectors/demo.ts`, in the `demo_create_task` tool object, add `workflowSafe: true,` immediately after `kind: "write",` (line 33):
```ts
      type: "function",
      kind: "write",
      workflowSafe: true, // credential-free demo write — the one tool workflow-cleared in v1
      function: {
        name: "demo_create_task",
```

- [ ] **Step 5: Replace BLAST_LOW/resolveBlast with WORKFLOW_SAFE/isWorkflowSafe**

In `src/lib/agent/safety/policy.ts`, replace lines 33-45 (the `// G2 blast-radius tier ...` comment through the `resolveBlast` function) with:
```ts
// Workflow-readiness gate (orthogonal to read/write). A connector WRITE may run inside a
// workflow run ONLY if its tool self-declares workflowSafe:true. Derived from the CONNECTORS
// registry (single source of truth, same idiom as kind) and FAIL-CLOSED: anything not declared
// is treated as not-safe. Reads are gated separately by resolveKind — only WRITEs are
// readiness-classified at the call site. (spec 2026-06-08 §3.)
const WORKFLOW_SAFE: ReadonlySet<string> = new Set(
  CONNECTORS.flatMap((c) => c.tools.filter((t) => t.workflowSafe).map((t) => t.function.name)),
);

export function isWorkflowSafe(name: string): boolean {
  return WORKFLOW_SAFE.has(name);
}
```
(`CONNECTORS` is already imported at line 9 — no new import needed.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/safety/policy.test.ts`
Expected: PASS (all resolveKind tests + new isWorkflowSafe block).

- [ ] **Step 7: Commit**

```bash
git add src/lib/connectors/types.ts src/lib/connectors/demo.ts src/lib/agent/safety/policy.ts src/lib/agent/safety/policy.test.ts
git commit -m "feat(workflow): self-declared workflowSafe flag (registry-derived, fail-closed)"
```

---

### Task 2: Wire the workflow gate to isWorkflowSafe

**Files:**
- Modify: `src/lib/workflow/blast.ts` (whole file — import, body, comment, error message)
- Test: `src/lib/workflow/blast.test.ts:9,19,24` (error-message matcher + describe text)

- [ ] **Step 1: Update the gate tests (failing test)**

In `src/lib/workflow/blast.test.ts`:
- Line 9 describe text: change `"assertConnectorAllowed (blast gate, v1 BLAST_LOW-only)"` to `"assertConnectorAllowed (workflow-readiness gate, fail-closed)"`.
- Line 19: change `.toThrow(/blast/i)` to `.toThrow(/workflow/i)`.
- Line 24: change `.toThrow(/blast/i)` to `.toThrow(/workflow/i)`.
- Line 14 test title `"LOW write qua được (demo_create_task)"` → `"cleared write qua được (demo_create_task)"`.
- Line 18 test title `"HIGH write fail-closed THROW (trello_create_card)"` → `"un-cleared write fail-closed THROW (trello_create_card)"`.

(Line 28 `.toThrow(/trello_create_card/)` stays — the action name is still in the message.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workflow/blast.test.ts`
Expected: FAIL — current message is `blast: '...'`, the new matcher `/workflow/i` does not match yet.

- [ ] **Step 3: Rewrite blast.ts**

Replace the entire contents of `src/lib/workflow/blast.ts` with:
```ts
// Workflow-readiness gate cho connector node trong workflow. Một connector action mà
// resolveKind nói là `write` VÀ isWorkflowSafe nói là CHƯA-clear → fail-closed THROW.
// Reads qua được; cleared writes (workflowSafe:true) qua được. Wire vào buildRunNode
// TRƯỚC connectorExecute (real-run) → không có đường nào chạy write chưa-clear.
import { resolveKind, isWorkflowSafe } from "@/lib/agent/safety/policy";
import type { Tool } from "@/lib/agent/types";

export function assertConnectorAllowed(action: string, internal: Tool[]): void {
  // Chỉ WRITE mới xét readiness; reads luôn cho qua.
  if (resolveKind(action, internal) !== "write") return;
  if (!isWorkflowSafe(action)) {
    throw new Error(
      `workflow: '${action}' chưa được clear cho workflow (fail-closed)`,
    );
  }
  // Cleared write → qua.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workflow/blast.test.ts`
Expected: PASS (read passes, demo_create_task passes, trello_create_card + unknown throw `/workflow/i`, message names the action).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/blast.ts src/lib/workflow/blast.test.ts
git commit -m "feat(workflow): gate connector writes on workflowSafe (rename from blast)"
```

---

### Task 3: Dry-run seam — preview un-cleared writes, real-run enforces (🔴 security-critical)

**Files:**
- Modify: `src/lib/workflow/runtime.ts:21-30` (move gate behind `!dryRun`)
- Test: `src/lib/workflow/runtime.test.ts:13-20,43,58-64` (relabel real-run throw as seam; flip dry-run-uncleared from throw→mock)

- [ ] **Step 1: Update runtime tests (failing test)**

In `src/lib/workflow/runtime.test.ts`:

(a) Line 18 — change `.toThrow(/blast/i)` to `.toThrow(/workflow/i)`; and update the test title on line 13 from `"HIGH write connector node → THROW blast (KHÔNG gọi connectorExecute)"` to `"🔴 SEAM: real-run + un-cleared write → THROW (default=real=enforced), KHÔNG execute"`.

(b) Line 43 comment — change `demo_create_task = WRITE + BLAST_LOW (qua gate).` to `demo_create_task = WRITE + workflowSafe (cleared).`.

(c) Replace the test at lines 58-64 (`"dryRun + HIGH write → vẫn THROW blast ..."`) with the NEW preview behavior:
```ts
  test("dryRun + un-cleared write → MOCK preview (KHÔNG throw — xem trước được)", async () => {
    execSpy.mockClear();
    const run = buildRunNode("u1", { dryRun: true });
    // trello_create_card chưa workflowSafe → real-run sẽ throw, NHƯNG dry-run phải mock để preview.
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "trello", action: "trello_create_card", args: { name: "x" } };
    const out = await run(node, emptyContext({ source: "manual" }));
    expect(execSpy).not.toHaveBeenCalled(); // mock — không execute thật
    expect(out).toMatchObject({ dryRun: true, wouldHaveCalled: "trello_create_card", args: { name: "x" } });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workflow/runtime.test.ts`
Expected: FAIL — currently the gate runs before the dry-run mock, so dry-run + trello throws instead of returning the mock object; and line 18 matcher `/workflow/i` doesn't match `blast:` yet.

- [ ] **Step 3: Move the gate behind `!dryRun` in runtime.ts**

In `src/lib/workflow/runtime.ts`, replace the connector branch (lines 21-30) with:
```ts
    if (node.kind === "connector") {
      // SECURITY-CRITICAL SEAM: real-run enforces the readiness gate (default = real =
      // enforced). Dry-run is the NARROW, explicit opt-out — writes are mocked below, so an
      // un-cleared write can be previewed but NEVER executes on any path.
      if (!dryRun) assertConnectorAllowed(node.action, INTERNAL_TOOLS);
      // Dry-run: vô hiệu hoá SIDE-EFFECT của node WRITE — trả output giả để node sau /
      // nhánh condition vẫn chạy tiếp; READ vẫn execute THẬT (local model $0, xem spec).
      const execute = (action: string, args: Record<string, unknown>): Promise<unknown> =>
        dryRun && resolveKind(action, INTERNAL_TOOLS) === "write"
          ? Promise.resolve({ dryRun: true, wouldHaveCalled: action, args })
          : connectorExecute(userId, action, args);
      return runConnectorNode(node, ctx, { execute });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workflow/runtime.test.ts`
Expected: PASS — real-run + trello throws `/workflow/i` (execSpy not called); dry-run + trello returns the mock object (execSpy not called); dry-run + demo mocks; dry-run + read executes real; real-run + demo/read execute real.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/runtime.ts src/lib/workflow/runtime.test.ts
git commit -m "feat(workflow): dry-run previews un-cleared writes; real-run enforces gate"
```

---

### Task 4: Full verification + type-check

**Files:** none (verification only)

- [ ] **Step 1: Run the full workflow + safety suites**

Run: `npx vitest run src/lib/workflow src/lib/agent/safety src/lib/connectors`
Expected: PASS — no test references `resolveBlast`/`BLAST_LOW` anymore; all gate + dry-run + policy tests green.

- [ ] **Step 2: Type-check the project**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms no lingering `resolveBlast`/`BLAST_LOW` importers and the new `workflowSafe` field type-checks.)

- [ ] **Step 3: Run the whole test suite**

Run: `npm test`
Expected: full suite green (the change is additive + fail-closed; only renamed symbols + the deliberate dry-run behavior flip).

- [ ] **Step 4: Commit (if any incidental fixes were needed)**

```bash
git add -A
git commit -m "test(workflow): verify workflowSafe gate + dry-run seam green across suite"
```
(If nothing changed in Steps 1-3, skip this commit.)

---

## Self-Review

**Spec coverage:**
- §3.1 field + registry derivation → Task 1 ✓
- §3.2 gate shape → Task 2 ✓
- §3.3 trigger uniformity → unchanged code (gate has no trigger param); covered by existing manual-context tests ✓
- §4 dry-run seam + §9 real-run-throws security test → Task 3 ✓
- §8 rename blast→workflowSafe (remove BLAST_LOW/resolveBlast/BLAST_HIGH) → Tasks 1-3 ✓
- §9 default-fail-closed test → Task 1 Step 1 ✓; tripwire (only demo safe) → Task 1 ✓
- §5/§7 NOT flipping tools → confirmed: only demo declares the flag; tripwire test locks this ✓

**Placeholder scan:** none — every step has exact paths, code, commands, expected output.

**Type consistency:** `workflowSafe?: boolean` (types.ts) ↔ `isWorkflowSafe(name): boolean` (policy.ts) ↔ used in blast.ts + policy.test.ts tripwire. `assertConnectorAllowed(action, internal)` signature unchanged (Task 2/3 callers match). Error message `workflow: '...'` ↔ test matcher `/workflow/i` (Tasks 2,3). No dangling `resolveBlast`/`BLAST_LOW` references after Task 1.

**Out-of-scope (separate work):** tier-low flip (config), gmail destination-control gate (design), manual dry-run-default UX (slice).
