import { describe, expect, test } from "vitest";
import { mapStepStatus, stepsToNodeStatuses, edgeRunDecoration } from "./nodeStatus";

describe("mapStepStatus — Rule 13 vocab bridge", () => {
  // The exact SSE strings (NOT look-alikes) must map to the badge vocab.
  test("succeeded → success (NOT the raw 'succeeded')", () => {
    expect(mapStepStatus("succeeded")).toBe("success");
  });
  test("failed → error (NOT the raw 'failed')", () => {
    expect(mapStepStatus("failed")).toBe("error");
  });
  test("running → running", () => {
    expect(mapStepStatus("running")).toBe("running");
  });
  test("unknown/queued → idle (no badge)", () => {
    expect(mapStepStatus("queued")).toBe("idle");
    expect(mapStepStatus("")).toBe("idle");
  });
});

describe("stepsToNodeStatuses", () => {
  test("folds steps into a nodeId→status map with the mapped vocab", () => {
    expect(
      stepsToNodeStatuses([
        { nodeId: "a", status: "succeeded" },
        { nodeId: "b", status: "running" },
        { nodeId: "c", status: "failed" },
      ]),
    ).toEqual({ a: "success", b: "running", c: "error" });
  });

  test("last status per node wins", () => {
    expect(
      stepsToNodeStatuses([
        { nodeId: "a", status: "running" },
        { nodeId: "a", status: "succeeded" },
      ]),
    ).toEqual({ a: "success" });
  });

  test("empty → empty", () => {
    expect(stepsToNodeStatuses([])).toEqual({});
  });
});

describe("edgeRunDecoration", () => {
  test("animates from running/success source while the run is live", () => {
    expect(edgeRunDecoration("running", "running")).toEqual({ animated: true, errored: false });
    expect(edgeRunDecoration("success", "running")).toEqual({ animated: true, errored: false });
  });
  test("no animation when the run is not live", () => {
    expect(edgeRunDecoration("running", null)).toEqual({ animated: false, errored: false });
    expect(edgeRunDecoration("success", "succeeded")).toEqual({ animated: false, errored: false });
  });
  test("errored when the source node failed", () => {
    expect(edgeRunDecoration("error", "running")).toEqual({ animated: false, errored: true });
    expect(edgeRunDecoration("error", null)).toEqual({ animated: false, errored: true });
  });
  test("idle source → no decoration", () => {
    expect(edgeRunDecoration("idle", "running")).toEqual({ animated: false, errored: false });
  });
});
