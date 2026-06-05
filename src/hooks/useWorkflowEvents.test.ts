// RTL behaviour tests for useWorkflowEvents.
// We mock EventSource to control what events fire.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ----- EventSource mock -----
type Listener = (e: { data: string }) => void;

class FakeEventSource {
  static instance: FakeEventSource | null = null;
  listeners: Record<string, Listener[]> = {};
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instance = this;
  }

  addEventListener(type: string, fn: Listener) {
    (this.listeners[type] ||= []).push(fn);
  }

  emit(type: string, data: object) {
    for (const fn of this.listeners[type] ?? []) fn({ data: JSON.stringify(data) });
  }

  close() {
    this.closed = true;
  }
}

vi.stubGlobal("EventSource", FakeEventSource);

import { useWorkflowEvents } from "./useWorkflowEvents";

beforeEach(() => {
  FakeEventSource.instance = null;
});
afterEach(() => {
  FakeEventSource.instance?.close();
  vi.restoreAllMocks();
});

function fire(type: string, data: object) {
  FakeEventSource.instance?.emit(type, data);
}

describe("useWorkflowEvents", () => {
  test("starts with empty state", () => {
    const { result } = renderHook(() => useWorkflowEvents());
    expect(result.current.steps).toEqual([]);
    expect(result.current.runStatus).toBeNull();
    expect(result.current.activeRunId).toBeNull();
  });

  test("workflow_run_step event updates steps", () => {
    const { result } = renderHook(() => useWorkflowEvents());
    act(() => {
      fire("workflow_run_step", {
        type: "workflow_run_step",
        runId: "r1",
        nodeId: "n1",
        seq: 0,
        status: "running",
      });
    });
    expect(result.current.steps).toHaveLength(1);
    expect(result.current.steps[0]).toMatchObject({ nodeId: "n1", status: "running" });
    expect(result.current.activeRunId).toBe("r1");
  });

  test("step upserts: same nodeId → last status wins", () => {
    const { result } = renderHook(() => useWorkflowEvents());
    act(() => {
      fire("workflow_run_step", { type: "workflow_run_step", runId: "r1", nodeId: "n1", seq: 0, status: "running" });
    });
    act(() => {
      fire("workflow_run_step", { type: "workflow_run_step", runId: "r1", nodeId: "n1", seq: 0, status: "succeeded" });
    });
    expect(result.current.steps).toHaveLength(1);
    expect(result.current.steps[0].status).toBe("succeeded");
  });

  test("new run resets steps", () => {
    const { result } = renderHook(() => useWorkflowEvents());
    act(() => {
      fire("workflow_run_step", { type: "workflow_run_step", runId: "r1", nodeId: "n1", seq: 0, status: "succeeded" });
    });
    expect(result.current.steps).toHaveLength(1);
    act(() => {
      fire("workflow_run_step", { type: "workflow_run_step", runId: "r2", nodeId: "n1", seq: 0, status: "running" });
    });
    // steps reset because new runId
    expect(result.current.steps).toHaveLength(1);
    expect(result.current.activeRunId).toBe("r2");
  });

  test("workflow_run event sets runStatus", () => {
    const { result } = renderHook(() => useWorkflowEvents());
    act(() => {
      fire("workflow_run", { type: "workflow_run", runId: "r1", status: "succeeded" });
    });
    expect(result.current.runStatus).toBe("succeeded");
    expect(result.current.activeRunId).toBe("r1");
  });

  test("steps sorted by seq", () => {
    const { result } = renderHook(() => useWorkflowEvents());
    act(() => {
      fire("workflow_run_step", { type: "workflow_run_step", runId: "r1", nodeId: "n2", seq: 1, status: "running" });
    });
    act(() => {
      fire("workflow_run_step", { type: "workflow_run_step", runId: "r1", nodeId: "n1", seq: 0, status: "succeeded" });
    });
    expect(result.current.steps[0].nodeId).toBe("n1");
    expect(result.current.steps[1].nodeId).toBe("n2");
  });
});
