import { describe, expect, test } from "vitest";
import { assertConnectorAllowed, assertMcpAllowed } from "./blast";
import type { Tool } from "@/lib/agent/types";

// P2: MCP trong workflow KHÔNG có đường workflowSafe — chỉ read (readAllow:
// trustReadHints × readOnlyHint) được chạy; còn lại HIGH-blast fail-closed
// (PIN connectors-mcp-client).
describe("assertMcpAllowed (MCP write fail-closed trong workflow)", () => {
  test("tool trong readAllow → qua", () => {
    expect(() => assertMcpAllowed("mcp__daab__kg_query", new Set(["mcp__daab__kg_query"]))).not.toThrow();
  });

  test("tool ngoài readAllow (write / chưa-trust) → throw fail-closed kèm tên tool", () => {
    expect(() => assertMcpAllowed("mcp__daab__kg_store_concept", new Set())).toThrow(/fail-closed/);
    expect(() => assertMcpAllowed("mcp__daab__kg_store_concept", new Set())).toThrow(/mcp__daab__kg_store_concept/);
  });
});

// internal tools (read) — không phải đối tượng của gate connector, nhưng truyền vào
// để resolveKind phân loại đúng connector actions theo allowlist policy.
const internal: Tool[] = [];

describe("assertConnectorAllowed (workflow-readiness gate, fail-closed)", () => {
  test("connector READ qua được (demo_list_tasks)", () => {
    expect(() => assertConnectorAllowed("demo_list_tasks", internal)).not.toThrow();
  });

  test("cleared write qua được (demo_create_task)", () => {
    expect(() => assertConnectorAllowed("demo_create_task", internal)).not.toThrow();
  });

  test("un-cleared write fail-closed THROW (trello_create_card)", () => {
    expect(() => assertConnectorAllowed("trello_create_card", internal)).toThrow(/workflow/i);
  });

  test("tool lạ (chưa phân loại) = write fail-closed → un-cleared → THROW", () => {
    // resolveKind tool lạ = write (fail-closed) + isWorkflowSafe = false → gate chặn.
    expect(() => assertConnectorAllowed("unknown_write_tool", internal)).toThrow(/workflow/i);
  });

  test("thông báo lỗi nêu tên action", () => {
    expect(() => assertConnectorAllowed("trello_create_card", internal)).toThrow(/trello_create_card/);
  });
});
