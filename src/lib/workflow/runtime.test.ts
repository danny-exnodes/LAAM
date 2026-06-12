import { describe, expect, test, vi } from "vitest";

// Mock connectors execute để phân biệt "gate chặn" vs "lọt xuống execute".
// vi.hoisted: factory vi.mock được hoist lên đầu file → biến phải qua hoisted.
const { execSpy, recipientSpy, mcpReadAllowSpy } = vi.hoisted(() => ({
  execSpy: vi.fn(async () => ({ ok: true })),
  recipientSpy: vi.fn(),
  mcpReadAllowSpy: vi.fn(async (): Promise<ReadonlySet<string>> => new Set<string>()),
}));
vi.mock("@/lib/connectors", () => ({ execute: execSpy, mcpReadAllow: mcpReadAllowSpy }));

// P3: custom-agent preset resolution (per-user) — mock lib + Ollama (agent node
// chạy thật tới callOllamaChat nếu không mock).
const { getCustomAgentSpy, callOllamaSpy } = vi.hoisted(() => ({
  getCustomAgentSpy: vi.fn(async (): Promise<{ system: string } | null> => null),
  callOllamaSpy: vi.fn(async (_messages: { role: string; content: string }[], _tools: unknown[], _format?: Record<string, unknown>) => ({
    message: { content: "OK" },
  })),
}));
vi.mock("@/lib/customAgents", () => ({ getCustomAgent: getCustomAgentSpy }));
vi.mock("./ollama", () => ({ callOllamaChat: callOllamaSpy }));
// Spy the recipient gate: its BEHAVIOR is tested in recipient.test.ts; here we verify WIRING
// (invoked in the real-execute branch with resolved args; skipped on the dry-run mock path).
vi.mock("./recipient", () => ({ assertRecipientAllowed: recipientSpy }));

import { buildRunNode } from "./runtime";
import { emptyContext } from "./types";
import type { WfAgentNode, WfConnectorNode, WfMcpNode } from "./types";

describe("buildRunNode — workflow-readiness gate wired into connector path", () => {
  test("🔴 SEAM: real-run + un-cleared write → THROW (default=real=enforced), KHÔNG execute", async () => {
    const run = buildRunNode("u1"); // no dryRun → real-run
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "trello", action: "trello_create_card", args: {} };
    // Gate ném đồng bộ TRƯỚC khi trả promise → bọc trong Promise.resolve().then để
    // bắt cả sync-throw lẫn rejection (engine await runNode trong try/catch → fail-stop).
    await expect(Promise.resolve().then(() => run(node, emptyContext({ source: "manual" })))).rejects.toThrow(/workflow/i);
    expect(execSpy).not.toHaveBeenCalled(); // gate chặn TRƯỚC execute
  });

  test("cleared write connector node qua gate → gọi connectorExecute", async () => {
    execSpy.mockClear();
    const run = buildRunNode("u1");
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_create_task", args: { title: "x" } };
    await run(node, emptyContext({ source: "manual" }));
    expect(execSpy).toHaveBeenCalledWith("u1", "demo_create_task", { title: "x" });
  });

  test("READ connector node qua gate → gọi connectorExecute", async () => {
    execSpy.mockClear();
    const run = buildRunNode("u1");
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} };
    await run(node, emptyContext({ source: "manual" }));
    expect(execSpy).toHaveBeenCalledWith("u1", "demo_list_tasks", {});
  });
});

describe("buildRunNode — dry-run mocks connector writes", () => {
  test("dryRun + cleared write → output giả, KHÔNG gọi connectorExecute", async () => {
    execSpy.mockClear();
    const run = buildRunNode("u1", { dryRun: true });
    // demo_create_task = WRITE + workflowSafe (cleared). Dry-run phải mock, không execute thật.
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_create_task", args: { title: "x" } };
    const out = await run(node, emptyContext({ source: "manual" }));
    expect(execSpy).not.toHaveBeenCalled();
    expect(out).toMatchObject({ dryRun: true, wouldHaveCalled: "demo_create_task", args: { title: "x" } });
  });

  test("dryRun + READ → vẫn execute THẬT (read chạy bình thường)", async () => {
    execSpy.mockClear();
    const run = buildRunNode("u1", { dryRun: true });
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} };
    await run(node, emptyContext({ source: "manual" }));
    expect(execSpy).toHaveBeenCalledWith("u1", "demo_list_tasks", {});
  });

  test("dryRun + un-cleared write → MOCK preview (KHÔNG throw — xem trước được)", async () => {
    execSpy.mockClear();
    const run = buildRunNode("u1", { dryRun: true });
    // trello_create_card chưa workflowSafe → real-run sẽ throw, NHƯNG dry-run phải mock để preview.
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "trello", action: "trello_create_card", args: { name: "x" } };
    const out = await run(node, emptyContext({ source: "manual" }));
    expect(execSpy).not.toHaveBeenCalled(); // mock — không execute thật
    expect(out).toMatchObject({ dryRun: true, wouldHaveCalled: "trello_create_card", args: { name: "x" } });
  });
});

// P2: MCP node — readAllow (trustReadHints × readOnlyHint) là ranh giới duy nhất:
// read chạy thật, mọi thứ khác fail-closed (real-run) / mock (dry-run preview).
describe("buildRunNode — mcp node", () => {
  const node: WfMcpNode = { id: "m1", kind: "mcp", server: "daab", tool: "kg_query", args: { project_id: "p-1" } };

  test("real-run + tool trong readAllow → execute với tên namespaced", async () => {
    execSpy.mockClear();
    mcpReadAllowSpy.mockResolvedValueOnce(new Set(["mcp__daab__kg_query"]));
    const run = buildRunNode("u1");
    await run(node, emptyContext({ source: "manual" }));
    expect(execSpy).toHaveBeenCalledWith("u1", "mcp__daab__kg_query", { project_id: "p-1" });
  });

  test("🔴 real-run + ngoài readAllow (write/chưa-trust) → THROW fail-closed, KHÔNG execute", async () => {
    execSpy.mockClear();
    mcpReadAllowSpy.mockResolvedValueOnce(new Set());
    const run = buildRunNode("u1");
    await expect(Promise.resolve().then(() => run(node, emptyContext({ source: "manual" })))).rejects.toThrow(/fail-closed/);
    expect(execSpy).not.toHaveBeenCalled();
  });

  test("dry-run + ngoài readAllow → MOCK preview, KHÔNG execute", async () => {
    execSpy.mockClear();
    mcpReadAllowSpy.mockResolvedValueOnce(new Set());
    const run = buildRunNode("u1", { dryRun: true });
    const out = await run(node, emptyContext({ source: "manual" }));
    expect(execSpy).not.toHaveBeenCalled();
    expect(out).toMatchObject({ dryRun: true, wouldHaveCalled: "mcp__daab__kg_query", args: { project_id: "p-1" } });
  });

  test("dry-run + read (trong readAllow) → execute THẬT (đồng nhất connector read)", async () => {
    execSpy.mockClear();
    mcpReadAllowSpy.mockResolvedValueOnce(new Set(["mcp__daab__kg_query"]));
    const run = buildRunNode("u1", { dryRun: true });
    await run(node, emptyContext({ source: "manual" }));
    expect(execSpy).toHaveBeenCalledWith("u1", "mcp__daab__kg_query", { project_id: "p-1" });
  });
});

// P3: agent node + customAgentId — preset (per-user) override system; preset mất
// (xoá / khác user) = FAIL-LOUD chứ không lặng lẽ chạy default (Rule 12).
describe("buildRunNode — agent node custom-agent preset (P3)", () => {
  test("customAgentId + preset tồn tại → system = preset.system", async () => {
    callOllamaSpy.mockClear();
    getCustomAgentSpy.mockResolvedValueOnce({ system: "Bạn là chuyên gia tóm tắt." });
    const run = buildRunNode("u1");
    const node: WfAgentNode = { id: "a1", kind: "agent", prompt: "tóm tắt", customAgentId: "ca-1", system: "bị override" };
    await run(node, emptyContext({ source: "manual" }));
    expect(getCustomAgentSpy).toHaveBeenCalledWith("u1", "ca-1");
    const firstCallMessages = callOllamaSpy.mock.calls[0][0];
    expect(firstCallMessages[0]).toEqual({ role: "system", content: "Bạn là chuyên gia tóm tắt." });
  });

  test("🔴 customAgentId nhưng preset không tồn tại/khác user → FAIL-LOUD, không gọi model", async () => {
    callOllamaSpy.mockClear();
    getCustomAgentSpy.mockResolvedValueOnce(null);
    const run = buildRunNode("u1");
    const node: WfAgentNode = { id: "a1", kind: "agent", prompt: "x", customAgentId: "ca-gone" };
    await expect(Promise.resolve().then(() => run(node, emptyContext({ source: "manual" })))).rejects.toThrow(/custom agent/i);
    expect(callOllamaSpy).not.toHaveBeenCalled();
  });

  test("không có customAgentId → behavior cũ nguyên vẹn (không tra preset)", async () => {
    callOllamaSpy.mockClear();
    getCustomAgentSpy.mockClear();
    const run = buildRunNode("u1");
    const node: WfAgentNode = { id: "a1", kind: "agent", prompt: "x", system: "S riêng" };
    await run(node, emptyContext({ source: "manual" }));
    expect(getCustomAgentSpy).not.toHaveBeenCalled();
    const firstCallMessages = callOllamaSpy.mock.calls[0][0];
    expect(firstCallMessages[0]).toEqual({ role: "system", content: "S riêng" });
  });
});

describe("buildRunNode — recipient gate wired into real-execute", () => {
  test("real-run connector → assertRecipientAllowed(action, resolvedArgs) called", async () => {
    execSpy.mockClear();
    recipientSpy.mockClear();
    const run = buildRunNode("u1");
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_create_task", args: { title: "x" } };
    await run(node, emptyContext({ source: "manual" }));
    expect(recipientSpy).toHaveBeenCalledWith("demo_create_task", { title: "x" });
    expect(execSpy).toHaveBeenCalled();
  });

  test("dry-run write → assertRecipientAllowed NOT called (mock short-circuits before real-execute)", async () => {
    execSpy.mockClear();
    recipientSpy.mockClear();
    const run = buildRunNode("u1", { dryRun: true });
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "demo", action: "demo_create_task", args: { title: "x" } };
    await run(node, emptyContext({ source: "manual" }));
    expect(recipientSpy).not.toHaveBeenCalled();
    expect(execSpy).not.toHaveBeenCalled();
  });
});
