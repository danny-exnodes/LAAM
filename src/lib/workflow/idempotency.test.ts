import { describe, test, expect, vi } from "vitest";
import { withWriteIdempotency, isWrite, iterIndexOf, type ClaimResult } from "./idempotency";
import type { RunContext, WfNode } from "./types";

const ctx = (vars: Record<string, unknown> = {}): RunContext => ({ trigger: {}, steps: {}, vars });

describe("isWrite", () => {
  test("agent node is not a write", () => {
    expect(isWrite({ id: "a", kind: "agent", prompt: "x" } as WfNode)).toBe(false);
  });
  test("connector with a registered write action is a write", () => {
    expect(isWrite({ id: "w", kind: "connector", connectorId: "demo", action: "demo_create_task", args: {} } as WfNode)).toBe(true);
  });
  test("connector with an unknown action fails closed to write", () => {
    expect(isWrite({ id: "u", kind: "connector", connectorId: "x", action: "totally_unknown_action_xyz", args: {} } as WfNode)).toBe(true);
  });
});

describe("iterIndexOf", () => {
  test("returns ctx.vars.index when numeric (foreach body)", () => {
    expect(iterIndexOf(ctx({ index: 3 }))).toBe(3);
  });
  test("returns 0 when no index (linear)", () => {
    expect(iterIndexOf(ctx())).toBe(0);
  });
});

describe("withWriteIdempotency (F1 WAL — applied to initial run AND resume)", () => {
  const writeNode = { id: "w1", kind: "connector", connectorId: "demo", action: "demo_create_task", args: {} } as WfNode;
  const readNode = { id: "r1", kind: "agent", prompt: "x" } as WfNode;
  const key0 = { runId: "run1", nodeId: "w1", iterIndex: 0 };

  test("read node passes straight through to base (no claim)", async () => {
    const base = vi.fn(async () => "READ_OUT");
    const claimNode = vi.fn();
    const wrapped = withWriteIdempotency(base, { db: {} as never, runId: "run1", claimNode, recordNodeOutput: vi.fn() });
    expect(await wrapped(readNode, ctx())).toBe("READ_OUT");
    expect(claimNode).not.toHaveBeenCalled();
  });

  test("fresh write: claims, executes base once, records output", async () => {
    const base = vi.fn(async () => ({ id: 42 }));
    const claimNode = vi.fn(async (): Promise<ClaimResult> => ({ claimed: true }));
    const recordNodeOutput = vi.fn(async () => {});
    const wrapped = withWriteIdempotency(base, { db: {} as never, runId: "run1", claimNode, recordNodeOutput });
    expect(await wrapped(writeNode, ctx())).toEqual({ id: 42 });
    expect(claimNode).toHaveBeenCalledWith({}, key0);
    expect(base).toHaveBeenCalledOnce();
    expect(recordNodeOutput).toHaveBeenCalledWith({}, key0, { id: 42 });
  });

  test("already done: replays stored output, does NOT execute base (no re-send)", async () => {
    const base = vi.fn(async () => "SHOULD_NOT_RUN");
    const claimNode = vi.fn(async (): Promise<ClaimResult> => ({ claimed: false, status: "done", output: { id: 99 } }));
    const wrapped = withWriteIdempotency(base, { db: {} as never, runId: "run1", claimNode, recordNodeOutput: vi.fn() });
    expect(await wrapped(writeNode, ctx())).toEqual({ id: 99 });
    expect(base).not.toHaveBeenCalled();
  });

  test("claimed but no output (crash mid-send): throws fail-loud, does NOT execute base", async () => {
    const base = vi.fn(async () => "SHOULD_NOT_RUN");
    const claimNode = vi.fn(async (): Promise<ClaimResult> => ({ claimed: false, status: "claimed", output: null }));
    const wrapped = withWriteIdempotency(base, { db: {} as never, runId: "run1", claimNode, recordNodeOutput: vi.fn() });
    await expect(wrapped(writeNode, ctx())).rejects.toThrow(/crash|cannot safely/i);
    expect(base).not.toHaveBeenCalled();
  });

  test("foreach body write keys by ctx.vars.index (iterIndex)", async () => {
    const base = vi.fn(async () => "ok");
    const claimNode = vi.fn(async (): Promise<ClaimResult> => ({ claimed: true }));
    const wrapped = withWriteIdempotency(base, { db: {} as never, runId: "run1", claimNode, recordNodeOutput: vi.fn() });
    await wrapped(writeNode, ctx({ index: 5 }));
    expect(claimNode).toHaveBeenCalledWith({}, { runId: "run1", nodeId: "w1", iterIndex: 5 });
  });
});
