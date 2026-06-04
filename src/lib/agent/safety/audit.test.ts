import { describe, expect, test } from "vitest";
import { buildAuditRecord, nonceUsedInRows, WRITE_ACTION } from "./audit";

describe("buildAuditRecord", () => {
  test("action=agent_write, target chứa nonce+tool, args redacted", () => {
    const rec = buildAuditRecord("u1", {
      nonce: "n1",
      tool: "trello_create_card",
      args: { name: "X", url: "a?token=abc123def456" },
    });
    expect(rec.action).toBe(WRITE_ACTION);
    expect(rec.userId).toBe("u1");
    const parsed = JSON.parse(rec.target);
    expect(parsed.nonce).toBe("n1");
    expect(parsed.tool).toBe("trello_create_card");
    expect(JSON.stringify(parsed.args)).toContain("‹redacted›");
  });
});

describe("nonceUsedInRows", () => {
  const rows = [{ target: buildAuditRecord("u", { nonce: "used1", tool: "t", args: {} }).target }];
  test("true khi nonce đã có (replay)", () => {
    expect(nonceUsedInRows(rows, "used1")).toBe(true);
  });
  test("false khi nonce mới", () => {
    expect(nonceUsedInRows(rows, "fresh2")).toBe(false);
  });
  test("target null bỏ qua an toàn", () => {
    expect(nonceUsedInRows([{ target: null }], "x")).toBe(false);
  });
});
