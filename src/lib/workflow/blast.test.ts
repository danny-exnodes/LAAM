import { describe, expect, test } from "vitest";
import { assertConnectorAllowed } from "./blast";
import type { Tool } from "@/lib/agent/types";

// internal tools (read) — không phải đối tượng của gate connector, nhưng truyền vào
// để resolveKind phân loại đúng connector actions theo allowlist policy.
const internal: Tool[] = [];

describe("assertConnectorAllowed (blast gate, v1 BLAST_LOW-only)", () => {
  test("connector READ qua được (demo_list_tasks)", () => {
    expect(() => assertConnectorAllowed("demo_list_tasks", internal)).not.toThrow();
  });

  test("LOW write qua được (demo_create_task)", () => {
    expect(() => assertConnectorAllowed("demo_create_task", internal)).not.toThrow();
  });

  test("HIGH write fail-closed THROW (trello_create_card)", () => {
    expect(() => assertConnectorAllowed("trello_create_card", internal)).toThrow(/blast/i);
  });

  test("tool lạ (chưa phân loại) = write fail-closed → HIGH → THROW", () => {
    // resolveKind tool lạ = write (fail-closed) + resolveBlast = high → gate chặn.
    expect(() => assertConnectorAllowed("unknown_write_tool", internal)).toThrow(/blast/i);
  });

  test("thông báo lỗi nêu tên action", () => {
    expect(() => assertConnectorAllowed("trello_create_card", internal)).toThrow(/trello_create_card/);
  });
});
