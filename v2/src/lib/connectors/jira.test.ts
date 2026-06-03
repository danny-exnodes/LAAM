import { afterEach, describe, expect, test, vi } from "vitest";
import jira from "./jira";

afterEach(() => {
  vi.restoreAllMocks();
});

const CREDS = { site: "acme.atlassian.net", email: "me@acme.com", api_token: "tok" };

describe("jira connector", () => {
  test("identity + tool names", () => {
    expect(jira.id).toBe("jira");
    expect(jira.tools.map((t) => t.function.name)).toEqual(["jira_search_issues", "jira_my_issues"]);
  });

  test("jira_search_issues shapes issue (key/summary/status/assignee/url)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        total: 1,
        issues: [
          {
            key: "ABC-1",
            fields: { summary: "Fix bug", status: { name: "In Progress" }, assignee: { displayName: "An" } },
          },
        ],
      }),
    );
    const r = (await jira.handlers.jira_search_issues({ jql: "project = ABC" }, CREDS)) as {
      total: number;
      issues: { key: string; summary: string; status: string; assignee: string; url: string }[];
    };
    expect(r.total).toBe(1);
    expect(r.issues[0]).toMatchObject({
      key: "ABC-1",
      summary: "Fix bug",
      status: "In Progress",
      assignee: "An",
      url: "https://acme.atlassian.net/browse/ABC-1",
    });
  });

  test("missing site throws", async () => {
    await expect(jira.handlers.jira_my_issues({}, { email: "x", api_token: "y" })).rejects.toThrow(
      /thiếu site/,
    );
  });

  test("test() returns ok with displayName", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ displayName: "An Nguyen" }));
    const r = await jira.test!(CREDS);
    expect(r.ok).toBe(true);
    expect(r.info).toContain("An Nguyen");
  });
});
