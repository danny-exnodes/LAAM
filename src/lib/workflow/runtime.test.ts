import { describe, expect, test, vi } from "vitest";

// Mock connectors execute để phân biệt "gate chặn" vs "lọt xuống execute".
// vi.hoisted: factory vi.mock được hoist lên đầu file → biến phải qua hoisted.
const { execSpy } = vi.hoisted(() => ({ execSpy: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/connectors", () => ({ execute: execSpy }));

import { buildRunNode } from "./runtime";
import { emptyContext } from "./types";
import type { WfConnectorNode } from "./types";

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
