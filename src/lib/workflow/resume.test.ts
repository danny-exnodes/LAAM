import { describe, test, expect, vi } from "vitest";
import { makeResumeRunNode } from "./resume";
import type { ClaimResult } from "./idempotency";
import type { RunContext, WfNode } from "./types";

const ctx = (vars: Record<string, unknown> = {}): RunContext => ({ trigger: {}, steps: {}, vars });
const writeNode = { id: "w1", kind: "connector", connectorId: "demo", action: "demo_create_task", args: {} } as WfNode;
const readNode = { id: "r1", kind: "agent", prompt: "x" } as WfNode;

describe("makeResumeRunNode (resume = write-idempotency + read-skip)", () => {
  test("write node routes through idempotency (claim + execute on fresh)", async () => {
    const base = vi.fn(async () => "W");
    const claimNode = vi.fn(async (): Promise<ClaimResult> => ({ claimed: true }));
    const recordNodeOutput = vi.fn(async () => {});
    const rn = makeResumeRunNode(base, { db: {} as never, runId: "r", seen: new Set(), journaled: new Map(), claimNode, recordNodeOutput });
    await rn(writeNode, ctx());
    expect(claimNode).toHaveBeenCalledOnce();
    expect(base).toHaveBeenCalledOnce();
    expect(recordNodeOutput).toHaveBeenCalledOnce();
  });

  test("completed write replays stored output, base NOT called (no re-send)", async () => {
    const base = vi.fn(async () => "SHOULD_NOT_RUN");
    const claimNode = vi.fn(async (): Promise<ClaimResult> => ({ claimed: false, status: "done", output: { id: 7 } }));
    const rn = makeResumeRunNode(base, { db: {} as never, runId: "r", seen: new Set(["w1"]), journaled: new Map(), claimNode, recordNodeOutput: vi.fn() });
    expect(await rn(writeNode, ctx())).toEqual({ id: 7 });
    expect(base).not.toHaveBeenCalled();
  });

  test("completed read (seen, iterIndex 0) returns journaled output, base NOT called", async () => {
    const base = vi.fn(async () => "FRESH");
    const rn = makeResumeRunNode(base, { db: {} as never, runId: "r", seen: new Set(["r1"]), journaled: new Map([["r1", "OLD"]]), claimNode: vi.fn(), recordNodeOutput: vi.fn() });
    expect(await rn(readNode, ctx())).toBe("OLD");
    expect(base).not.toHaveBeenCalled();
  });

  test("fresh read (not in seen) executes base", async () => {
    const base = vi.fn(async () => "FRESH");
    const rn = makeResumeRunNode(base, { db: {} as never, runId: "r", seen: new Set(), journaled: new Map(), claimNode: vi.fn(), recordNodeOutput: vi.fn() });
    expect(await rn(readNode, ctx())).toBe("FRESH");
    expect(base).toHaveBeenCalledOnce();
  });

  test("foreach read (iterIndex>0) re-runs even if nodeId in seen (documented limitation)", async () => {
    const base = vi.fn(async () => "RERUN");
    const rn = makeResumeRunNode(base, { db: {} as never, runId: "r", seen: new Set(["r1"]), journaled: new Map([["r1", "OLD"]]), claimNode: vi.fn(), recordNodeOutput: vi.fn() });
    expect(await rn(readNode, ctx({ index: 2 }))).toBe("RERUN");
    expect(base).toHaveBeenCalledOnce();
  });
});
