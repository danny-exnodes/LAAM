import { describe, expect, test, vi } from "vitest";

// Mock connectors execute để phân biệt "gate chặn" vs "lọt xuống execute".
// vi.hoisted: factory vi.mock được hoist lên đầu file → biến phải qua hoisted.
const { execSpy } = vi.hoisted(() => ({ execSpy: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/connectors", () => ({ execute: execSpy }));

import { buildRunNode } from "./runtime";
import { emptyContext } from "./types";
import type { WfConnectorNode } from "./types";

describe("buildRunNode — blast gate wired into connector path", () => {
  test("HIGH write connector node → THROW blast (KHÔNG gọi connectorExecute)", async () => {
    const run = buildRunNode("u1");
    const node: WfConnectorNode = { id: "n1", kind: "connector", connectorId: "trello", action: "trello_create_card", args: {} };
    // Gate ném đồng bộ TRƯỚC khi trả promise → bọc trong Promise.resolve().then để
    // bắt cả sync-throw lẫn rejection (engine await runNode trong try/catch → fail-stop).
    await expect(Promise.resolve().then(() => run(node, emptyContext({ source: "manual" })))).rejects.toThrow(/blast/i);
    expect(execSpy).not.toHaveBeenCalled(); // gate chặn TRƯỚC execute
  });

  test("LOW write connector node qua gate → gọi connectorExecute", async () => {
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
