import { describe, test, expect, vi } from "vitest";
import { resumeRunRow } from "./resume";
import type { WorkflowGraph } from "./types";

// Honest in-memory fake db modelling the three stores resumeRunRow + the F1 WAL touch:
// workflow_run, workflow_run_step (the journal), workflow_node_idempotency. The idempotency
// store models INSERT ON CONFLICT DO NOTHING RETURNING faithfully (key collision → []),
// so a re-sent write would be CAUGHT, not hidden.
const NAME = Symbol.for("drizzle:Name");
const tname = (t: unknown) => (t as Record<symbol, unknown>)[NAME] as string;

type Seed = {
  run: { id: string; userId: string; trigger: string; graphSnapshot: WorkflowGraph };
  succeededSteps: { nodeId: string; kind: string; status: string; output: unknown; seq: number }[];
  idem: { runId: string; nodeId: string; iterIndex: number; status: "claimed" | "done"; output: unknown }[];
};

function makeFakeDb(seed: Seed) {
  const steps = seed.succeededSteps.map((s) => ({ ...s }));
  const idem = new Map<string, { status: string; output: unknown }>();
  for (const i of seed.idem) idem.set(`${i.runId}|${i.nodeId}|${i.iterIndex}`, { status: i.status, output: i.output });
  let pendingIdemKey = "";

  const rowsFor = (name: string): unknown[] => {
    if (name === "workflow_run") return [seed.run];
    if (name === "workflow_run_step") return steps.filter((s) => s.status === "succeeded");
    if (name === "workflow_node_idempotency") {
      const r = idem.get(pendingIdemKey);
      return r ? [r] : [];
    }
    return [];
  };

  const db = {
    select: () => ({
      from: (table: unknown) => {
        const name = tname(table);
        return {
          where: () => {
            const result = rowsFor(name);
            return {
              then: (resolve: (x: unknown) => void) => resolve(result), // awaitable (step select)
              limit: async () => result, // run + idempotency select
            };
          },
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        const name = tname(table);
        if (name === "workflow_node_idempotency") {
          const key = `${v.runId}|${v.nodeId}|${v.iterIndex}`;
          pendingIdemKey = key;
          return {
            onConflictDoNothing: () => ({
              returning: async () => {
                if (idem.has(key)) return []; // conflict → already claimed/done
                idem.set(key, { status: "claimed", output: null });
                return [{ id: key }];
              },
            }),
            then: (resolve: (x: unknown) => void) => resolve(undefined),
          };
        }
        if (name === "workflow_run_step") steps.push({ ...(v as never) });
        return { then: (resolve: (x: unknown) => void) => resolve(undefined) };
      },
    }),
    update: (table: unknown) => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          if (tname(table) === "workflow_node_idempotency") {
            const r = idem.get(pendingIdemKey);
            if (r) { r.status = String(v.status); r.output = v.output; }
          }
        },
      }),
    }),
  };
  return { db, idem };
}

const graph: WorkflowGraph = {
  nodes: [
    { id: "w", kind: "connector", connectorId: "demo", action: "demo_create_task", args: { title: "once" } },
    { id: "a", kind: "agent", prompt: "summarize" },
  ],
  edges: [{ from: "w", to: "a" }],
};

describe("resume integration — F1 no double-send, continue past crash", () => {
  test("write already journaled + idempotency-done → resume runs only the downstream node, does NOT re-send the write", async () => {
    const executed: string[] = []; // every node whose base runNode actually ran
    const sends: string[] = []; // connector sends specifically
    const buildRunNode = () => async (node: { id: string; kind: string }) => {
      executed.push(node.id);
      if (node.kind === "connector") sends.push(node.id);
      return node.id === "w" ? { id: 7 } : "done";
    };
    const { db } = makeFakeDb({
      run: { id: "run1", userId: "u1", trigger: "manual", graphSnapshot: graph },
      succeededSteps: [{ nodeId: "w", kind: "connector", status: "succeeded", output: { id: 7 }, seq: 0 }],
      idem: [{ runId: "run1", nodeId: "w", iterIndex: 0, status: "done", output: { id: 7 } }],
    });

    const res = await resumeRunRow("run1", { db: db as never, publish: vi.fn(), buildRunNode });

    expect(res.status).toBe("succeeded");
    // ← the invariant: the committed write is replayed from idempotency, base NOT called → no re-send
    expect(executed).not.toContain("w");
    expect(sends).not.toContain("w");
    expect(executed).toContain("a"); // run continued past the crash point
  });

  test("truncated WRITE producer in journal → resume fails loud, never walks", async () => {
    const sends: string[] = [];
    const buildRunNode = () => async (node: { id: string; kind: string }) => {
      if (node.kind === "connector") sends.push(node.id);
      return "x";
    };
    const { db } = makeFakeDb({
      run: { id: "run1", userId: "u1", trigger: "manual", graphSnapshot: graph },
      succeededSteps: [
        { nodeId: "w", kind: "connector", status: "succeeded", output: { _truncated: true, bytes: 9e9, preview: "{" }, seq: 0 },
      ],
      idem: [],
    });

    const res = await resumeRunRow("run1", { db: db as never, publish: vi.fn(), buildRunNode });

    expect(res.status).toBe("failed");
    expect(res.error).toMatch(/truncated|reconstructed/i);
    expect(sends).toEqual([]); // never executed anything
  });
});
