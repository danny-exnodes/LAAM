import { describe, expect, test, vi } from "vitest";
import { resolveKind, resolveBlast, BLAST_LOW } from "./policy";
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
    // this on purpose → forces a conscious gate/blast review. All are gated by
    // withSafety (confirm-card) and are HIGH blast (not in BLAST_LOW), so they are
    // fail-closed in workflow runs — only interactive, confirmed chat.
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
      "trello_comment_card",
      "trello_create_card",
      "trello_update_card",
    ]);
  });
});

describe("resolveBlast (G2 — blast-radius tier, v1 LOW-only allowlist)", () => {
  test("demo_create_task = LOW (allowlisted)", () => {
    expect(resolveBlast("demo_create_task")).toBe("low");
  });
  test("BLAST_LOW chứa đúng demo_create_task (v1)", () => {
    expect([...BLAST_LOW]).toEqual(["demo_create_task"]);
  });
  test("write khác (trello_create_card) → HIGH", () => {
    expect(resolveBlast("trello_create_card")).toBe("high");
  });
  test("tool không trong allowlist → HIGH (mặc định fail-closed)", () => {
    expect(resolveBlast("anything_else")).toBe("high");
  });
});
