import { describe, expect, test } from "vitest";
import { CONNECTORS } from "./registry";

describe("connector registry", () => {
  test("registers all 7 connectors", () => {
    expect(CONNECTORS.map((c) => c.id).sort()).toEqual(
      ["demo", "github", "gmail", "google-calendar", "google-drive", "jira", "trello"].sort(),
    );
  });

  test("connector ids are unique", () => {
    const ids = CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every tool name is unique across all connectors", () => {
    const names = CONNECTORS.flatMap((c) => c.tools.map((t) => t.function.name));
    expect(new Set(names).size).toBe(names.length);
  });

  test("every tool has a matching handler", () => {
    for (const c of CONNECTORS) {
      for (const t of c.tools) {
        expect(typeof c.handlers[t.function.name]).toBe("function");
      }
    }
  });

  test("tool-name inventory matches v1 (parity)", () => {
    const names = CONNECTORS.flatMap((c) => c.tools.map((t) => t.function.name)).sort();
    expect(names).toEqual(
      [
        "demo_create_task", // FEAT-5: credential-free write-gate demo tool
        "demo_list_tasks",
        "gcal_list_events",
        "gdrive_list_files",
        "gdrive_search",
        "github_list_issues",
        "github_list_repos",
        "github_search_issues",
        "gmail_list_messages",
        "gmail_search",
        "jira_my_issues",
        "jira_search_issues",
        "trello_create_card",
        "trello_list_boards",
        "trello_list_cards",
      ].sort(),
    );
  });
});
