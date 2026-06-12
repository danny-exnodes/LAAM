import { describe, expect, test, vi } from "vitest";
import { resolveKind, isWorkflowSafe } from "./policy";
import { CONNECTORS } from "@/lib/connectors/registry";
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
  test("MCP tool: fail-closed write by default, read only when in readAllow (opt-in)", () => {
    // MCP tools aren't in the static registry. Without opt-in they must gate (write);
    // a per-user readAllow set (built from trustReadHints × readOnlyHint) flips a
    // specific tool to read. This is the whole trust model — keep it honest.
    expect(resolveKind("mcp__slack__post_message", internal)).toBe("write");
    expect(resolveKind("mcp__notion__search", internal, new Set(["mcp__notion__search"]))).toBe("read");
    // readAllow only whitelists the exact name — a different MCP tool still gates.
    expect(resolveKind("mcp__notion__delete_page", internal, new Set(["mcp__notion__search"]))).toBe("write");
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
  test("registry write surface (P5) — full audit list, derived from kind", () => {
    // The COMPLETE set of self-declared writes. Adding/removing a write tool fails
    // this on purpose → forces a conscious gate/readiness review. All are gated by
    // withSafety (confirm-card) and are not yet workflowSafe (fail-closed in workflow
    // runs until explicitly flipped) — interactive confirmed chat works regardless.
    const writes = CONNECTORS.flatMap((c) =>
      c.tools.filter((t) => t.kind === "write").map((t) => t.function.name),
    ).sort();
    expect(writes).toEqual([
      "demo_create_task",
      "gcal_create_event",
      "gdrive_create_folder",
      "github_comment_issue",
      "github_create_issue",
      "gmail_send",
      "jira_add_comment",
      "jira_create_issue",
      "slack_send_message",
      "trello_comment_card",
      "trello_create_card",
      "trello_update_card",
      "whatsapp_send_message",
      "zalo_send_message",
    ]);
  });
});

describe("isWorkflowSafe (workflow-readiness — fail-closed default)", () => {
  test("demo_create_task = true (đã khai workflowSafe)", () => {
    expect(isWorkflowSafe("demo_create_task")).toBe(true);
  });
  test("default fail-closed: write chưa khai cờ → false", () => {
    // LOAD-BEARING: test này phải FAIL nếu ai đó default cờ = true cho tool chưa clear.
    expect(isWorkflowSafe("trello_create_card")).toBe(false);
  });
  test("tool lạ → false (fail-closed)", () => {
    expect(isWorkflowSafe("anything_else")).toBe(false);
  });
  test("đúng tập workflowSafe (demo + gmail_send) — tripwire: flip CÓ Ý", () => {
    // gmail_send flip CÓ Ý 2026-06-09: CTO code-verify parseRecipients + recipient-allowlist
    // gate (chỉ chạy khi WORKFLOW_RECIPIENT_ALLOWLIST set + recipient khớp). 9 tool tier-low
    // VẪN fail-closed tới khi flip. Thêm/bớt workflowSafe phải cập nhật list này (audit).
    const safe = CONNECTORS.flatMap((c) =>
      c.tools.filter((t) => t.workflowSafe).map((t) => t.function.name),
    ).sort();
    expect(safe).toEqual(["demo_create_task", "gmail_send"]);
  });
});
