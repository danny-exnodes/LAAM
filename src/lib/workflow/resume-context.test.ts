import { describe, test, expect } from "vitest";
import { rebuildContext, type JournalStep } from "./resume-context";

const trigger = { source: "manual" };

describe("rebuildContext", () => {
  test("populates ctx.steps from succeeded journal rows", () => {
    const steps: JournalStep[] = [
      { nodeId: "n1", kind: "connector", action: "demo_list_tasks", status: "succeeded", output: { tasks: [1, 2] } },
      { nodeId: "n2", kind: "agent", status: "succeeded", output: "summary" },
    ];
    const { ctx, hazards } = rebuildContext(trigger, steps);
    expect(ctx.steps.n1.output).toEqual({ tasks: [1, 2] });
    expect(ctx.steps.n2.output).toBe("summary");
    expect(hazards).toEqual([]);
  });

  test("ignores non-succeeded rows", () => {
    const steps: JournalStep[] = [
      { nodeId: "n1", kind: "agent", status: "failed", output: null },
      { nodeId: "n2", kind: "agent", status: "running", output: null },
    ];
    const { ctx } = rebuildContext(trigger, steps);
    expect(Object.keys(ctx.steps)).toEqual([]);
  });

  test("truncated READ producer → hazard 'rerun', node left OUT of ctx so it re-runs", () => {
    const steps: JournalStep[] = [
      { nodeId: "n1", kind: "connector", action: "demo_list_tasks", status: "succeeded", output: { _truncated: true, bytes: 999999, preview: "[" } },
    ];
    const { ctx, hazards } = rebuildContext(trigger, steps);
    expect(ctx.steps.n1).toBeUndefined();
    expect(hazards).toEqual([
      { nodeId: "n1", kind: "connector", action: "demo_list_tasks", action_class: "read", resolution: "rerun" },
    ]);
  });

  test("truncated WRITE producer → hazard 'fail' (committed write cannot be re-run)", () => {
    const steps: JournalStep[] = [
      { nodeId: "n9", kind: "connector", action: "demo_create_task", status: "succeeded", output: { _truncated: true, bytes: 999999, preview: "{" } },
    ];
    const { hazards } = rebuildContext(trigger, steps);
    expect(hazards).toEqual([
      { nodeId: "n9", kind: "connector", action: "demo_create_task", action_class: "write", resolution: "fail" },
    ]);
  });

  test("truncated AGENT producer (no action) classifies as read → 'rerun'", () => {
    const steps: JournalStep[] = [
      { nodeId: "a1", kind: "agent", status: "succeeded", output: { _truncated: true, bytes: 999999, preview: "x" } },
    ];
    const { hazards } = rebuildContext(trigger, steps);
    expect(hazards[0].action_class).toBe("read");
    expect(hazards[0].resolution).toBe("rerun");
  });
});
