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

  test("v1 tool parity preserved + P4b/P5 additions (36 total)", () => {
    // Every original v1 tool must still exist (parity guard — never silently drop
    // one). After P4b (reads) + P5 (writes) the registry has 36 tools; a wrong
    // count means a tool was added/removed without updating this audit.
    const names = new Set(CONNECTORS.flatMap((c) => c.tools.map((t) => t.function.name)));
    const v1 = [
      "demo_create_task",
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
    ];
    for (const n of v1) expect(names.has(n)).toBe(true);
    expect(names.size).toBe(36);
  });
});
