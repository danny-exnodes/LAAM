/**
 * NodeConfigPanel.test.tsx — RTL behavior tests.
 *
 * Tests that:
 *   1. The agent form renders initial values and calls onChange with updated config.
 *   2. The connector form shows args JSON parse-error when input is invalid JSON.
 *   3. The connector form calls onChange when connectorId/action changes.
 */
import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeConfigPanel } from "./NodeConfigPanel";
import type { WfAgentNode, WfConnectorNode, WfConditionNode, WfForeachNode } from "@/lib/workflow/types";

// ─── Agent form ───────────────────────────────────────────────────────────

describe("AgentForm", () => {
  const agentNode: WfAgentNode = {
    id: "a1",
    kind: "agent",
    prompt: "Initial prompt",
    system: "Initial system",
  };

  test("renders initial prompt value", () => {
    render(<NodeConfigPanel node={agentNode} onChange={vi.fn()} />);
    const promptArea = screen.getByPlaceholderText(/Nhập prompt/);
    expect((promptArea as HTMLTextAreaElement).value).toBe("Initial prompt");
  });

  test("renders initial system prompt value", () => {
    render(<NodeConfigPanel node={agentNode} onChange={vi.fn()} />);
    const systemArea = screen.getByPlaceholderText(/dùng mặc định/);
    expect((systemArea as HTMLTextAreaElement).value).toBe("Initial system");
  });

  test("editing prompt calls onChange with updated prompt", () => {
    const onChange = vi.fn();
    render(<NodeConfigPanel node={agentNode} onChange={onChange} />);
    const promptArea = screen.getByPlaceholderText(/Nhập prompt/);
    fireEvent.change(promptArea, { target: { value: "New prompt text" } });
    expect(onChange).toHaveBeenCalledOnce();
    const updated = onChange.mock.calls[0][0] as WfAgentNode;
    expect(updated.kind).toBe("agent");
    expect(updated.prompt).toBe("New prompt text");
  });

  test("editing system prompt calls onChange with updated system", () => {
    const onChange = vi.fn();
    render(<NodeConfigPanel node={agentNode} onChange={onChange} />);
    const systemArea = screen.getByPlaceholderText(/dùng mặc định/);
    fireEvent.change(systemArea, { target: { value: "New system" } });
    expect(onChange).toHaveBeenCalledOnce();
    const updated = onChange.mock.calls[0][0] as WfAgentNode;
    expect(updated.system).toBe("New system");
  });

  test("clearing system prompt results in undefined (not empty string)", () => {
    const onChange = vi.fn();
    render(<NodeConfigPanel node={agentNode} onChange={onChange} />);
    const systemArea = screen.getByPlaceholderText(/dùng mặc định/);
    fireEvent.change(systemArea, { target: { value: "" } });
    const updated = onChange.mock.calls[0][0] as WfAgentNode;
    expect(updated.system).toBeUndefined();
  });

  test("node id is displayed", () => {
    render(<NodeConfigPanel node={agentNode} onChange={vi.fn()} />);
    expect(screen.getByText("a1")).toBeInTheDocument();
  });

  test("kind badge shows 'Agent'", () => {
    render(<NodeConfigPanel node={agentNode} onChange={vi.fn()} />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });
});

// ─── Connector form ───────────────────────────────────────────────────────

describe("ConnectorForm", () => {
  const connNode: WfConnectorNode = {
    id: "c1",
    kind: "connector",
    connectorId: "trello",
    action: "list_tasks",
    args: { board: "{{boardId}}" },
  };

  test("renders connectorId and action values", () => {
    render(<NodeConfigPanel node={connNode} onChange={vi.fn()} />);
    expect((screen.getByPlaceholderText(/vd: trello/) as HTMLInputElement).value).toBe("trello");
    expect((screen.getByPlaceholderText(/vd: demo_list_tasks/) as HTMLInputElement).value).toBe("list_tasks");
  });

  test("editing connectorId calls onChange with updated connectorId", () => {
    const onChange = vi.fn();
    render(<NodeConfigPanel node={connNode} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/vd: trello/);
    fireEvent.change(input, { target: { value: "github" } });
    expect(onChange).toHaveBeenCalledOnce();
    const updated = onChange.mock.calls[0][0] as WfConnectorNode;
    expect(updated.connectorId).toBe("github");
  });

  test("editing action calls onChange with updated action", () => {
    const onChange = vi.fn();
    render(<NodeConfigPanel node={connNode} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/vd: demo_list_tasks/);
    fireEvent.change(input, { target: { value: "create_issue" } });
    const updated = onChange.mock.calls[0][0] as WfConnectorNode;
    expect(updated.action).toBe("create_issue");
  });

  test("invalid JSON in args shows parse error", () => {
    render(<NodeConfigPanel node={connNode} onChange={vi.fn()} />);
    const argsArea = screen.getByPlaceholderText(/\{/);
    fireEvent.change(argsArea, { target: { value: "{ invalid json" } });
    // Parse error message should be visible
    const errText = screen.getByText(/JSON không hợp lệ/);
    expect(errText).toBeInTheDocument();
  });

  test("valid JSON in args clears parse error and calls onChange", () => {
    const onChange = vi.fn();
    render(<NodeConfigPanel node={connNode} onChange={onChange} />);
    const argsArea = screen.getByPlaceholderText(/\{/);
    // First put invalid JSON to trigger error
    fireEvent.change(argsArea, { target: { value: "{ bad" } });
    expect(screen.queryByText(/JSON không hợp lệ/)).toBeInTheDocument();
    // Then fix it
    fireEvent.change(argsArea, { target: { value: '{"key":"value"}' } });
    expect(screen.queryByText(/JSON không hợp lệ/)).not.toBeInTheDocument();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    const updated = lastCall[0] as WfConnectorNode;
    expect(updated.args).toEqual({ key: "value" });
  });

  test("empty args clears to {} without error", () => {
    const onChange = vi.fn();
    render(<NodeConfigPanel node={connNode} onChange={onChange} />);
    const argsArea = screen.getByPlaceholderText(/\{/);
    fireEvent.change(argsArea, { target: { value: "" } });
    expect(screen.queryByText(/JSON không hợp lệ/)).not.toBeInTheDocument();
    const updated = onChange.mock.calls[0][0] as WfConnectorNode;
    expect(updated.args).toEqual({});
  });

  test("kind badge shows 'Connector'", () => {
    render(<NodeConfigPanel node={connNode} onChange={vi.fn()} />);
    expect(screen.getByText("Connector")).toBeInTheDocument();
  });
});

// ─── Condition form ───────────────────────────────────────────────────────

describe("ConditionForm", () => {
  const condNode: WfConditionNode = {
    id: "cond-1",
    kind: "condition",
    when: { left: "{{x}}", op: "gt", right: 0 },
  };

  test("kind badge shows 'Condition'", () => {
    render(<NodeConfigPanel node={condNode} onChange={vi.fn()} />);
    expect(screen.getByText("Condition")).toBeInTheDocument();
  });

  test("invalid predicate JSON shows parse error", () => {
    render(<NodeConfigPanel node={condNode} onChange={vi.fn()} />);
    const area = screen.getByPlaceholderText(/left/);
    fireEvent.change(area, { target: { value: "not json" } });
    expect(screen.getByText(/JSON không hợp lệ/)).toBeInTheDocument();
  });

  test("valid predicate JSON calls onChange", () => {
    const onChange = vi.fn();
    render(<NodeConfigPanel node={condNode} onChange={onChange} />);
    const area = screen.getByPlaceholderText(/left/);
    const newPredicate = JSON.stringify({ left: "{{y}}", op: "eq", right: "ok" });
    fireEvent.change(area, { target: { value: newPredicate } });
    expect(screen.queryByText(/JSON không hợp lệ/)).not.toBeInTheDocument();
    const updated = onChange.mock.calls[0][0] as WfConditionNode;
    expect(updated.when).toEqual({ left: "{{y}}", op: "eq", right: "ok" });
  });
});

// ─── Foreach form ─────────────────────────────────────────────────────────

describe("ForeachForm", () => {
  const feNode: WfForeachNode = {
    id: "fe-1",
    kind: "foreach",
    items: "{{steps.n1.output.items}}",
    body: { nodes: [], edges: [] },
  };

  test("kind badge shows 'Foreach'", () => {
    render(<NodeConfigPanel node={feNode} onChange={vi.fn()} />);
    expect(screen.getByText("Foreach")).toBeInTheDocument();
  });

  test("editing items calls onChange", () => {
    const onChange = vi.fn();
    render(<NodeConfigPanel node={feNode} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/steps/);
    fireEvent.change(input, { target: { value: "{{results}}" } });
    const updated = onChange.mock.calls[0][0] as WfForeachNode;
    expect(updated.items).toBe("{{results}}");
  });

  test("invalid body JSON shows parse error", () => {
    render(<NodeConfigPanel node={feNode} onChange={vi.fn()} />);
    // The body textarea uses placeholder with 'nodes'
    const areas = screen.getAllByRole("textbox");
    const bodyArea = areas.find((el) =>
      (el as HTMLTextAreaElement).placeholder?.includes("nodes"),
    )!;
    fireEvent.change(bodyArea, { target: { value: "{ bad json" } });
    expect(screen.getByText(/JSON không hợp lệ/)).toBeInTheDocument();
  });
});
