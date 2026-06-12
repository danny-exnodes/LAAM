/**
 * NodeConfigPanel.test.tsx — RTL behavior tests.
 *
 * Tests that:
 *   1. The agent form renders initial values and calls onChange with updated config.
 *   2. The connector form shows args JSON parse-error when input is invalid JSON.
 *   3. The connector form calls onChange when connectorId/action changes.
 */
import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { NodeConfigPanel } from "./NodeConfigPanel";
import type { WfNode, WfAgentNode, WfConnectorNode, WfConditionNode, WfForeachNode, WfMcpNode } from "@/lib/workflow/types";

// NodeConfigPanel now uses useT → must be wrapped in I18nProvider.
// Default lang "vi" matches the hardcoded Vietnamese placeholder strings
// already used in getByPlaceholderText/getByText queries below.
function renderPanel(element: React.ReactElement) {
  return render(<I18nProvider lang="vi">{element}</I18nProvider>);
}

// ─── Agent form ───────────────────────────────────────────────────────────

describe("AgentForm", () => {
  const agentNode: WfAgentNode = {
    id: "a1",
    kind: "agent",
    prompt: "Initial prompt",
    system: "Initial system",
  };

  test("renders initial prompt value", () => {
    renderPanel(<NodeConfigPanel node={agentNode} onChange={vi.fn()} />);
    const promptArea = screen.getByPlaceholderText(/Nhập prompt/);
    expect((promptArea as HTMLTextAreaElement).value).toBe("Initial prompt");
  });

  test("renders initial system prompt value", () => {
    renderPanel(<NodeConfigPanel node={agentNode} onChange={vi.fn()} />);
    const systemArea = screen.getByPlaceholderText(/dùng mặc định/);
    expect((systemArea as HTMLTextAreaElement).value).toBe("Initial system");
  });

  test("editing prompt calls onChange with updated prompt", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={agentNode} onChange={onChange} />);
    const promptArea = screen.getByPlaceholderText(/Nhập prompt/);
    fireEvent.change(promptArea, { target: { value: "New prompt text" } });
    expect(onChange).toHaveBeenCalledOnce();
    const updated = onChange.mock.calls[0][0] as WfAgentNode;
    expect(updated.kind).toBe("agent");
    expect(updated.prompt).toBe("New prompt text");
  });

  test("editing system prompt calls onChange with updated system", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={agentNode} onChange={onChange} />);
    const systemArea = screen.getByPlaceholderText(/dùng mặc định/);
    fireEvent.change(systemArea, { target: { value: "New system" } });
    expect(onChange).toHaveBeenCalledOnce();
    const updated = onChange.mock.calls[0][0] as WfAgentNode;
    expect(updated.system).toBe("New system");
  });

  test("clearing system prompt results in undefined (not empty string)", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={agentNode} onChange={onChange} />);
    const systemArea = screen.getByPlaceholderText(/dùng mặc định/);
    fireEvent.change(systemArea, { target: { value: "" } });
    const updated = onChange.mock.calls[0][0] as WfAgentNode;
    expect(updated.system).toBeUndefined();
  });

  test("node id is displayed", () => {
    renderPanel(<NodeConfigPanel node={agentNode} onChange={vi.fn()} />);
    expect(screen.getByText(/a1/)).toBeInTheDocument();
  });

  test("kind badge shows 'Agent'", () => {
    renderPanel(<NodeConfigPanel node={agentNode} onChange={vi.fn()} />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });
});

// ─── Agent form — format JSON schema (B1 structured output) ────────────────

describe("AgentForm — format JSON schema (B1)", () => {
  const agentNode: WfAgentNode = { id: "a1", kind: "agent", prompt: "p" };
  // The format textarea's placeholder shows a judge-style schema example (verdict).
  const formatArea = () => screen.getByPlaceholderText(/verdict/) as HTMLTextAreaElement;

  test("renders the optional format textarea, pre-filled from node.format", () => {
    const withFmt: WfAgentNode = { ...agentNode, format: { type: "object" } };
    renderPanel(<NodeConfigPanel node={withFmt} onChange={vi.fn()} />);
    expect(formatArea().value).toContain('"type"');
  });

  test("valid JSON object → onChange with parsed format", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={agentNode} onChange={onChange} />);
    fireEvent.change(formatArea(), { target: { value: '{"type":"object"}' } });
    const updated = onChange.mock.calls[0][0] as WfAgentNode;
    expect(updated.format).toEqual({ type: "object" });
  });

  test("invalid JSON → inline error, node NOT updated", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={agentNode} onChange={onChange} />);
    fireEvent.change(formatArea(), { target: { value: "{ bad json" } });
    expect(screen.getByText(/JSON không hợp lệ/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("JSON array → 'phải là object' error, node NOT updated", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={agentNode} onChange={onChange} />);
    fireEvent.change(formatArea(), { target: { value: "[1,2]" } });
    expect(screen.getByText(/Schema phải là.*object/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("clearing the textarea → format undefined (node trả text như cũ)", () => {
    const onChange = vi.fn();
    const withFmt: WfAgentNode = { ...agentNode, format: { type: "object" } };
    renderPanel(<NodeConfigPanel node={withFmt} onChange={onChange} />);
    fireEvent.change(formatArea(), { target: { value: "" } });
    const updated = onChange.mock.calls[0][0] as WfAgentNode;
    expect(updated.format).toBeUndefined();
    expect(screen.queryByText(/JSON không hợp lệ/)).not.toBeInTheDocument();
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
    renderPanel(<NodeConfigPanel node={connNode} onChange={vi.fn()} />);
    expect((screen.getByPlaceholderText(/vd: trello/) as HTMLInputElement).value).toBe("trello");
    expect((screen.getByPlaceholderText(/vd: demo_list_tasks/) as HTMLInputElement).value).toBe("list_tasks");
  });

  test("editing connectorId calls onChange with updated connectorId", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={connNode} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/vd: trello/);
    fireEvent.change(input, { target: { value: "github" } });
    expect(onChange).toHaveBeenCalledOnce();
    const updated = onChange.mock.calls[0][0] as WfConnectorNode;
    expect(updated.connectorId).toBe("github");
  });

  test("editing action calls onChange with updated action", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={connNode} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/vd: demo_list_tasks/);
    fireEvent.change(input, { target: { value: "create_issue" } });
    const updated = onChange.mock.calls[0][0] as WfConnectorNode;
    expect(updated.action).toBe("create_issue");
  });

  test("invalid JSON in args shows parse error", () => {
    renderPanel(<NodeConfigPanel node={connNode} onChange={vi.fn()} />);
    const argsArea = screen.getByPlaceholderText(/\{/);
    fireEvent.change(argsArea, { target: { value: "{ invalid json" } });
    // Parse error message should be visible
    const errText = screen.getByText(/JSON không hợp lệ/);
    expect(errText).toBeInTheDocument();
  });

  test("valid JSON in args clears parse error and calls onChange", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={connNode} onChange={onChange} />);
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
    renderPanel(<NodeConfigPanel node={connNode} onChange={onChange} />);
    const argsArea = screen.getByPlaceholderText(/\{/);
    fireEvent.change(argsArea, { target: { value: "" } });
    expect(screen.queryByText(/JSON không hợp lệ/)).not.toBeInTheDocument();
    const updated = onChange.mock.calls[0][0] as WfConnectorNode;
    expect(updated.args).toEqual({});
  });

  test("kind badge shows 'Connector'", () => {
    renderPanel(<NodeConfigPanel node={connNode} onChange={vi.fn()} />);
    expect(screen.getByText("Connector")).toBeInTheDocument();
  });
});

// ─── Condition form ───────────────────────────────────────────────────────

describe("ConditionForm — structured mode (default for simple predicate)", () => {
  const condNode: WfConditionNode = {
    id: "cond-1",
    kind: "condition",
    when: { left: "{{x}}", op: "gt", right: 0 },
  };

  test("kind badge shows 'Condition'", () => {
    renderPanel(<NodeConfigPanel node={condNode} onChange={vi.fn()} />);
    expect(screen.getByText("Condition")).toBeInTheDocument();
  });

  test("shows structured fields with initial values in form mode", () => {
    renderPanel(<NodeConfigPanel node={condNode} onChange={vi.fn()} />);
    // Left operand input
    const leftInput = screen.getByLabelText(/vế trái/i) as HTMLInputElement;
    expect(leftInput.value).toBe("{{x}}");
    // Op select
    const opSelect = screen.getByLabelText(/toán tử/i) as HTMLSelectElement;
    expect(opSelect.value).toBe("gt");
    // Right operand input
    const rightInput = screen.getByLabelText(/vế phải/i) as HTMLInputElement;
    expect(rightInput.value).toBe("0");
  });

  test("changing left field calls onChange with updated predicate", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={condNode} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/vế trái/i), { target: { value: "{{y}}" } });
    const updated = onChange.mock.calls[0][0] as WfConditionNode;
    expect(updated.when).toMatchObject({ left: "{{y}}", op: "gt" });
  });

  test("changing op select calls onChange with updated op", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={condNode} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/toán tử/i), { target: { value: "eq" } });
    const updated = onChange.mock.calls[0][0] as WfConditionNode;
    expect(updated.when).toMatchObject({ op: "eq" });
  });

  test("JSON mode toggle switches to textarea", () => {
    renderPanel(<NodeConfigPanel node={condNode} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /json/i }));
    // JSON textarea with placeholder containing 'left' should appear
    expect(screen.getByPlaceholderText(/left/)).toBeInTheDocument();
  });

  test("invalid predicate JSON shows parse error in JSON mode", () => {
    renderPanel(<NodeConfigPanel node={condNode} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /json/i }));
    const area = screen.getByPlaceholderText(/left/);
    fireEvent.change(area, { target: { value: "not json" } });
    expect(screen.getByText(/JSON không hợp lệ/)).toBeInTheDocument();
  });

  test("valid predicate JSON in JSON mode calls onChange", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={condNode} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /json/i }));
    const area = screen.getByPlaceholderText(/left/);
    const newPredicate = JSON.stringify({ left: "{{y}}", op: "eq", right: "ok" });
    fireEvent.change(area, { target: { value: newPredicate } });
    expect(screen.queryByText(/JSON không hợp lệ/)).not.toBeInTheDocument();
    const updated = onChange.mock.calls[0][0] as WfConditionNode;
    expect(updated.when).toEqual({ left: "{{y}}", op: "eq", right: "ok" });
  });
});

describe("ConditionForm — JSON mode for nested predicate", () => {
  const nestedNode: WfConditionNode = {
    id: "cond-2",
    kind: "condition",
    when: { all: [{ left: "{{x}}", op: "gt", right: 0 }, { left: "{{y}}", op: "eq", right: "ok" }] },
  };

  test("starts in JSON mode when predicate is nested (all/any)", () => {
    renderPanel(<NodeConfigPanel node={nestedNode} onChange={vi.fn()} />);
    // JSON textarea (with 'left' in placeholder) should be visible
    expect(screen.getByPlaceholderText(/left/)).toBeInTheDocument();
    // No 'Form' toggle because predicate is not a simple comparator
    expect(screen.queryByRole("button", { name: /^form$/i })).not.toBeInTheDocument();
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
    renderPanel(<NodeConfigPanel node={feNode} onChange={vi.fn()} />);
    expect(screen.getByText("Foreach")).toBeInTheDocument();
  });

  test("editing items calls onChange", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={feNode} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/steps/);
    fireEvent.change(input, { target: { value: "{{results}}" } });
    const updated = onChange.mock.calls[0][0] as WfForeachNode;
    expect(updated.items).toBe("{{results}}");
  });

  test("invalid body JSON shows parse error", () => {
    renderPanel(<NodeConfigPanel node={feNode} onChange={vi.fn()} />);
    // The body textarea uses placeholder with 'nodes'
    const areas = screen.getAllByRole("textbox");
    const bodyArea = areas.find((el) =>
      (el as HTMLTextAreaElement).placeholder?.includes("nodes"),
    )!;
    fireEvent.change(bodyArea, { target: { value: "{ bad json" } });
    expect(screen.getByText(/JSON không hợp lệ/)).toBeInTheDocument();
  });
});

// ─── Node Delete button ───────────────────────────────────────────────────────

describe("NodeConfigPanel — delete button", () => {
  const agentNode: WfAgentNode = { id: "del-test", kind: "agent", prompt: "test" };

  test("delete button rendered when onDelete prop provided", () => {
    renderPanel(<NodeConfigPanel node={agentNode} onChange={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /xoá node|delete node/i })).toBeInTheDocument();
  });

  test("delete button NOT rendered when onDelete omitted", () => {
    renderPanel(<NodeConfigPanel node={agentNode} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /xoá node|delete node/i })).not.toBeInTheDocument();
  });

  test("clicking delete button calls onDelete", () => {
    const onDelete = vi.fn();
    renderPanel(<NodeConfigPanel node={agentNode} onChange={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /xoá node|delete node/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

// ─── Connector picker (item D) ────────────────────────────────────────────────

describe("ConnectorForm — connector/action picker", () => {
  const connNode: WfConnectorNode = {
    id: "c1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {},
  };

  const mockConnectors = [
    {
      id: "demo", name: "Demo", icon: "🔌", blurb: "",
      connected: true, status: "connected" as const, account: null, tools: [{ name: "demo_list_tasks", description: "", parameters: {} }, { name: "demo_create_task", description: "", parameters: {} }],
      auth: { type: "none", provider: "", scopes: [], help: "", setup: "", oauthConfigured: false, fields: [] }, connectedAt: null,
    },
    {
      id: "github", name: "GitHub", icon: "🐙", blurb: "",
      connected: false, status: "disconnected" as const, account: null, tools: [{ name: "github_list_repos", description: "", parameters: {} }],
      auth: { type: "token", provider: "", scopes: [], help: "", setup: "", oauthConfigured: false, fields: [] }, connectedAt: null,
    },
  ];

  test("renders connector select when connectors provided", () => {
    renderPanel(<NodeConfigPanel node={connNode} onChange={vi.fn()} connectors={mockConnectors} />);
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(1);
    // /^Demo\b/i matches "Demo 🟢" but not "demo_list_tasks" / "demo_create_task"
    expect(screen.getByRole("option", { name: /^Demo\b/i })).toBeInTheDocument();
  });

  test("action select shows tools of selected connector", () => {
    renderPanel(<NodeConfigPanel node={connNode} onChange={vi.fn()} connectors={mockConnectors} />);
    expect(screen.getByRole("option", { name: "demo_list_tasks" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "demo_create_task" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "github_list_repos" })).not.toBeInTheDocument();
  });

  test("changing connector clears action and updates", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={connNode} onChange={onChange} connectors={mockConnectors} />);
    const connSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(connSelect, { target: { value: "github" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ connectorId: "github", action: "" }),
    );
  });

  test("shows not-connected warning when selected connector is disconnected", () => {
    const disconnectedNode: WfConnectorNode = { ...connNode, connectorId: "github" };
    renderPanel(<NodeConfigPanel node={disconnectedNode} onChange={vi.fn()} connectors={mockConnectors} />);
    expect(screen.getByText(/chưa kết nối|not connected/i)).toBeInTheDocument();
  });

  test("falls back to text inputs when connectors is empty array", () => {
    renderPanel(<NodeConfigPanel node={connNode} onChange={vi.fn()} connectors={[]} />);
    const inputs = screen.getAllByRole("textbox");
    const connectorInput = inputs.find((i) => (i as HTMLInputElement).value === "demo");
    expect(connectorInput).toBeInTheDocument();
  });
});

// ─── Schema-driven connector args (#1) ────────────────────────────────────────

describe("ConnectorForm — schema-driven args (#1)", () => {
  const schemaConnectors = [
    {
      id: "demo", name: "Demo", icon: "🔌", blurb: "",
      connected: true, status: "connected" as const, account: null,
      tools: [
        {
          name: "demo_create_task",
          description: "Create a task",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Task title" },
              status: { type: "string", enum: ["todo", "done"] },
            },
            required: ["title"],
          },
        },
      ],
      auth: { type: "none", provider: "", scopes: [], help: "", setup: "", oauthConfigured: false, fields: [] }, connectedAt: null,
    },
  ];
  const node: WfConnectorNode = { id: "c1", kind: "connector", connectorId: "demo", action: "demo_create_task", args: {} };

  test("renders a labelled field per tool parameter (not raw JSON)", () => {
    renderPanel(<NodeConfigPanel node={node} onChange={vi.fn()} connectors={schemaConnectors} />);
    expect(screen.getByText("title *")).toBeInTheDocument(); // required marker
    expect(screen.getByText("status")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "todo" })).toBeInTheDocument(); // enum option
  });

  test("editing a field writes node.args[key]", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={node} onChange={onChange} connectors={schemaConnectors} />);
    const titleInput = screen.getByText("title *").parentElement!.querySelector("input")!;
    fireEvent.change(titleInput, { target: { value: "Buy milk" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ args: { title: "Buy milk" } }));
  });

  test("Advanced toggle switches to the raw JSON editor", () => {
    renderPanel(<NodeConfigPanel node={node} onChange={vi.fn()} connectors={schemaConnectors} />);
    fireEvent.click(screen.getByText("Nâng cao (JSON)"));
    expect(screen.getByPlaceholderText(/"key"/)).toBeInTheDocument();
  });

  // Regression (QA E2E): with NO connectors prop the panel self-fetches /api/connectors,
  // so the tool schema arrives AFTER mount. The default mode must RE-SYNC to the form —
  // earlier it stayed stuck on the raw-JSON editor because the default was frozen at mount
  // (schema still null). Sync-prop tests above missed this; only the async path catches it.
  test("defaults to the FORM (not raw JSON) when connectors load async", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ connectors: schemaConnectors }) })) as unknown as typeof fetch,
    );
    try {
      renderPanel(<NodeConfigPanel node={node} onChange={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("title *")).toBeInTheDocument());
      expect(screen.queryByPlaceholderText(/"key"/)).not.toBeInTheDocument(); // no JSON textarea
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ─── Variable autocomplete (A) ────────────────────────────────────────────────

describe("VariableHints — flow-aware variable autocomplete (A / #2)", () => {
  const agentNode: WfAgentNode = { id: "a1", kind: "agent", prompt: "Hi" };
  const allNodes: WfNode[] = [
    agentNode,
    { id: "n2", kind: "connector", connectorId: "demo", action: "x", args: {} },
  ];
  // n2 runs BEFORE a1 (n2 → a1) → n2 is upstream of a1.
  const edges = [{ source: "n2", target: "a1" }];

  test("renders trigger + UPSTREAM chips under both agent fields, excludes self", () => {
    renderPanel(<NodeConfigPanel node={agentNode} onChange={vi.fn()} allNodes={allNodes} edges={edges} />);
    // chips render under BOTH the system and prompt fields → 2 of each token
    expect(screen.getAllByRole("button", { name: "{{trigger}}" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "{{steps.n2.output}}" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "{{steps.a1.output}}" })).not.toBeInTheDocument();
  });

  test("clicking the prompt's chip inserts the token into the prompt, keeps existing text", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={agentNode} onChange={onChange} allNodes={allNodes} edges={edges} />);
    // Scope to the prompt field's container so we click ITS chip (not the system field's)
    const promptArea = screen.getByPlaceholderText(/Nhập prompt/);
    const promptField = promptArea.parentElement as HTMLElement;
    fireEvent.click(within(promptField).getByRole("button", { name: "{{steps.n2.output}}" }));
    expect(onChange).toHaveBeenCalled();
    const updated = onChange.mock.calls[0][0] as WfAgentNode;
    expect(updated.prompt).toContain("{{steps.n2.output}}");
    expect(updated.prompt).toContain("Hi");
  });

  test("only the trigger chip when nothing is upstream (no edges)", () => {
    renderPanel(<NodeConfigPanel node={agentNode} onChange={vi.fn()} allNodes={allNodes} edges={[]} />);
    expect(screen.getAllByRole("button", { name: "{{trigger}}" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "{{steps.n2.output}}" })).not.toBeInTheDocument();
  });
});

// ─── AgentForm — custom-agent preset select (P3.4) ───────────────────────────
// Intent: chọn preset → node lưu customAgentId (runtime resolve + fail-loud);
// khi dùng preset thì system textarea ẨN (system do preset cấp, sửa ở Settings).

describe("AgentForm — custom-agent preset select (P3.4)", () => {
  const agentNode: WfAgentNode = { id: "a1", kind: "agent", prompt: "x" };
  const presets = [
    { id: "ca-1", name: "Tóm tắt" },
    { id: "ca-2", name: "Phân loại" },
  ];

  test("render preset select với options từ customAgents (inject)", () => {
    renderPanel(<NodeConfigPanel node={agentNode} onChange={vi.fn()} customAgents={presets} />);
    expect(screen.getByRole("option", { name: "Tóm tắt" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Phân loại" })).toBeInTheDocument();
  });

  test("chọn preset → onChange set customAgentId", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={agentNode} onChange={onChange} customAgents={presets} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "ca-1" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ customAgentId: "ca-1" }));
  });

  test("đang dùng preset → system textarea ẨN + hint hiện; bỏ preset → onChange xoá customAgentId", () => {
    const onChange = vi.fn();
    const withPreset: WfAgentNode = { ...agentNode, customAgentId: "ca-1" };
    renderPanel(<NodeConfigPanel node={withPreset} onChange={onChange} customAgents={presets} />);
    expect(screen.queryByText("System prompt")).not.toBeInTheDocument();
    expect(screen.getByText(/lấy từ preset/i)).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "" } });
    const updated = onChange.mock.calls[0][0] as WfAgentNode;
    expect(updated.customAgentId).toBeUndefined();
  });
});

// ─── McpForm — MCP node config (P2.4) ────────────────────────────────────────
// Intent: chọn server → chọn tool (từ toolDetails của /api/connectors/mcp) →
// SchemaArgsForm render required-args từ JSON Schema; tool write phải cảnh báo
// fail-closed (workflow chỉ chạy MCP read).

describe("McpForm — MCP node config (P2.4)", () => {
  const mcpNode: WfMcpNode = { id: "m1", kind: "mcp", server: "daab", tool: "kg_query", args: {} };
  const mcpServers = [
    {
      slug: "daab",
      name: "DAAB",
      tools: ["mcp__daab__kg_query", "mcp__daab__kg_store_concept"],
      toolDetails: [
        {
          name: "kg_query",
          nsName: "mcp__daab__kg_query",
          description: "truy vấn KG",
          kind: "read" as const,
          parameters: { type: "object", properties: { project_id: { type: "string", description: "UUID dự án" } }, required: ["project_id"] },
        },
        {
          name: "kg_store_concept",
          nsName: "mcp__daab__kg_store_concept",
          description: "ghi concept",
          kind: "write" as const,
          parameters: { type: "object", properties: {} },
        },
      ],
    },
    { slug: "other", name: "Other", tools: [], toolDetails: [] },
  ];

  test("render select server + select tool theo server đã chọn", () => {
    renderPanel(<NodeConfigPanel node={mcpNode} onChange={vi.fn()} mcpServers={mcpServers} />);
    expect(screen.getByRole("option", { name: /DAAB/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "kg_query" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "kg_store_concept" })).toBeInTheDocument();
  });

  test("đổi server → onChange reset tool + args", () => {
    const onChange = vi.fn();
    renderPanel(<NodeConfigPanel node={mcpNode} onChange={onChange} mcpServers={mcpServers} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "other" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ server: "other", tool: "", args: {} }));
  });

  test("schema-driven args: required field render input form (project_id)", () => {
    renderPanel(<NodeConfigPanel node={mcpNode} onChange={vi.fn()} mcpServers={mcpServers} />);
    expect(screen.getByText("project_id *")).toBeInTheDocument();
  });

  test("tool kind=write → cảnh báo fail-closed hiển thị", () => {
    const writeNode: WfMcpNode = { ...mcpNode, tool: "kg_store_concept" };
    renderPanel(<NodeConfigPanel node={writeNode} onChange={vi.fn()} mcpServers={mcpServers} />);
    expect(screen.getByText(/fail-closed/i)).toBeInTheDocument();
  });

  test("không có MCP server → hint thêm trong Kết nối", () => {
    renderPanel(<NodeConfigPanel node={mcpNode} onChange={vi.fn()} mcpServers={[]} />);
    expect(screen.getByText(/Chưa có MCP server/i)).toBeInTheDocument();
  });
});
