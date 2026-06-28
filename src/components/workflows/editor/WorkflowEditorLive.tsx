"use client";

/**
 * WorkflowEditorLive — thin client wrapper that connects the editor to live run
 * status. It owns the SSE subscription (useWorkflowEvents) so WorkflowEditor itself
 * stays free of EventSource and remains unit-testable via its nodeStatuses prop.
 *
 * Flow: WorkflowEditor's "▶ Test" button triggers a dry-run and calls onTestRun
 * with the returned runId → we track that run → fold its step events into per-node
 * statuses → feed them back as nodeStatuses (badges) + runStatus (edge animation).
 */
import { useMemo, useState } from "react";
import { useWorkflowEvents } from "@/hooks/useWorkflowEvents";
import { WorkflowEditor } from "./WorkflowEditor";
import { stepsToNodeStatuses, stepsToNodeOutputs } from "./nodeStatus";

export function WorkflowEditorLive({ workflowId }: { workflowId: string }) {
  const [testRunId, setTestRunId] = useState<string | undefined>(undefined);
  const { steps, runStatus } = useWorkflowEvents(testRunId);
  const nodeStatuses = useMemo(() => stepsToNodeStatuses(steps), [steps]);
  const nodeOutputs = useMemo(() => stepsToNodeOutputs(steps), [steps]);

  return (
    <WorkflowEditor
      workflowId={workflowId}
      nodeStatuses={nodeStatuses}
      nodeOutputs={nodeOutputs}
      runStatus={runStatus}
      onTestRun={setTestRunId}
    />
  );
}
