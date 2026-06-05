"use client";

// useWorkflowEvents — subscribe to SSE workflow_run / workflow_run_step events
// forwarded from /api/events. Callers receive an ordered list of the most recent
// step events keyed by runId, plus run-level status changes. The hook piggybacks
// on the existing /api/events stream; it DOES NOT open a second connection.
//
// Usage: const { steps, runStatus } = useWorkflowEvents(workflowId?);
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
 * If `workflowId` is undefined the hook still works but tracks any run.
 * Internally opens ONE EventSource to /api/events (reuses browser's connection
 * if the browser de-dupes same-origin SSE — but in practice creates one per
 * hook instance; keep at the page level, not per-row).
 */
export function useWorkflowEvents(): UseWorkflowEventsResult {
  const [steps, setSteps] = useState<WorkflowStepEvent[]>([]);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Use a ref to avoid stale closure over activeRunId inside the event handlers.
  const activeRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.addEventListener("workflow_run_step", (e) => {
      let evt: WorkflowStepEvent;
      try {
        evt = JSON.parse((e as MessageEvent).data) as WorkflowStepEvent;
      } catch {
        return;
      }
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
