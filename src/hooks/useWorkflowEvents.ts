"use client";

// useWorkflowEvents — subscribe to SSE workflow_run / workflow_run_step events
// forwarded from /api/events. Callers receive an ordered list of the most recent
// step events keyed by runId, plus run-level status changes. The hook piggybacks
// on the existing /api/events stream; it DOES NOT open a second connection.
//
// Usage: const { steps, runStatus } = useWorkflowEvents(expectedRunId?);
//   steps     — latest StepEvent[] for the active/most-recent run of this workflow
//   runStatus — latest run status string ("running"|"succeeded"|"failed"|null)

import { useEffect, useRef, useState } from "react";

export type WorkflowStepEvent = {
  type: "workflow_run_step";
  runId: string;
  nodeId: string;
  seq: number;
  status: string;
};

export type WorkflowRunEvent = {
  type: "workflow_run";
  runId: string;
  status: string;
};

export type UseWorkflowEventsResult = {
  /** Latest step events for the tracked runId (empty until a run starts). */
  steps: WorkflowStepEvent[];
  /** Latest run-level status ("running"|"succeeded"|"failed"|null). */
  runStatus: string | null;
  /** The runId currently being tracked (most recent run seen). */
  activeRunId: string | null;
};

/**
 * Subscribe to workflow_run / workflow_run_step SSE events.
 * If `expectedRunId` is set, ONLY that run's events are processed (others ignored)
 * — use it to lock the editor onto a specific Test run and avoid cross-run paint.
 * If omitted, the hook tracks whatever run is most recently seen.
 * Internally opens ONE EventSource to /api/events; keep at the page level, not per-row.
 */
export function useWorkflowEvents(expectedRunId?: string): UseWorkflowEventsResult {
  const [steps, setSteps] = useState<WorkflowStepEvent[]>([]);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Use a ref to avoid stale closure over activeRunId inside the event handlers.
  const activeRunIdRef = useRef<string | null>(null);
  // Keep the latest expectedRunId visible to the once-bound SSE handlers.
  const expectedRunIdRef = useRef<string | undefined>(expectedRunId);
  expectedRunIdRef.current = expectedRunId;

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.addEventListener("workflow_run_step", (e) => {
      let evt: WorkflowStepEvent;
      try {
        evt = JSON.parse((e as MessageEvent).data) as WorkflowStepEvent;
      } catch {
        return;
      }
      // Filter to the expected run (when set) — ignore foreign/concurrent runs.
      if (expectedRunIdRef.current && evt.runId !== expectedRunIdRef.current) return;
      // Track the most recently seen runId.
      if (activeRunIdRef.current !== evt.runId) {
        activeRunIdRef.current = evt.runId;
        setActiveRunId(evt.runId);
        // Reset steps when a new run starts.
        setSteps([]);
      }
      // Upsert the step by nodeId (last status wins).
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.nodeId === evt.nodeId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = evt;
          return next;
        }
        return [...prev, evt].sort((a, b) => a.seq - b.seq);
      });
    });

    es.addEventListener("workflow_run", (e) => {
      let evt: WorkflowRunEvent;
      try {
        evt = JSON.parse((e as MessageEvent).data) as WorkflowRunEvent;
      } catch {
        return;
      }
      if (expectedRunIdRef.current && evt.runId !== expectedRunIdRef.current) return;
      setRunStatus(evt.status);
      if (activeRunIdRef.current !== evt.runId) {
        activeRunIdRef.current = evt.runId;
        setActiveRunId(evt.runId);
      }
    });

    return () => es.close();
  }, []);

  return { steps, runStatus, activeRunId };
}
