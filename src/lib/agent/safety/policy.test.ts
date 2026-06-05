import { describe, expect, test, vi } from "vitest";
import { resolveKind, CONNECTOR_WRITES, CONNECTOR_READS } from "./policy";
import type { Tool } from "../types";

const internal: Tool[] = [
  { name: "laam_list_agents", description: "", kind: "read", parameters: {}, handler: async () => ({}) },
];

describe("resolveKind", () => {
  test("internal tool dùng Tool.kind", () => {
    expect(resolveKind("laam_list_agents", internal)).toBe("read");
  });
  test("connector write → write", () => {
    expect(resolveKind("trello_create_card", internal)).toBe("write");
  });
  test("connector read → read", () => {
    expect(resolveKind("github_list_repos", internal)).toBe("read");
  });
  test("tool lạ → write (FAIL-CLOSED) + cảnh báo loud", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveKind("evil_unknown_tool", internal)).toBe("write");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  test("demo_create_task → write (FEAT-5 demo fixture)", () => {
    expect(resolveKind("demo_create_task", internal)).toBe("write");
  });
  test("connector writes are trello_create_card + demo_create_task; not in READS", () => {
    expect([...CONNECTOR_WRITES].sort()).toEqual(["demo_create_task", "trello_create_card"]);
    expect(CONNECTOR_READS.has("trello_create_card")).toBe(false);
    expect(CONNECTOR_READS.has("demo_create_task")).toBe(false);
  });
});
