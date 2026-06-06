import { afterEach, describe, expect, test, vi } from "vitest";
import jira from "./jira";

afterEach(() => {
  vi.restoreAllMocks();
});

const CREDS = { site: "acme.atlassian.net", email: "me@acme.com", api_token: "tok" };

describe("jira connector", () => {
  test("identity + tool names", () => {
    expect(jira.id).toBe("jira");
    expect(jira.tools.map((t) => t.function.name)).toEqual([
      "jira_search_issues",
      "jira_my_issues",
      "jira_get_issue",
      "jira_list_projects",
      "jira_add_comment",
      "jira_create_issue",
    ]);
  });

  test("write tools declare kind:write, reads declare kind:read", () => {
    const kindOf = (name: string) => jira.tools.find((t) => t.function.name === name)!.kind;
    expect(kindOf("jira_get_issue")).toBe("read");
    expect(kindOf("jira_list_projects")).toBe("read");
    expect(kindOf("jira_add_comment")).toBe("write");
    expect(kindOf("jira_create_issue")).toBe("write");
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

  test("jira_get_issue shapes a single issue and requests the right path", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        key: "ABC-7",
        fields: { summary: "Ship it", status: { name: "Done" }, assignee: { displayName: "Binh" } },
      }),
    );
    const r = (await jira.handlers.jira_get_issue({ key: "ABC-7" }, CREDS)) as {
      issue: { key: string; summary: string; status: string; assignee: string; url: string };
    };
    expect(spy.mock.calls[0][0]).toBe(
      "https://acme.atlassian.net/rest/api/3/issue/ABC-7?fields=summary,status,assignee",
    );
    expect(r.issue).toMatchObject({
      key: "ABC-7",
      summary: "Ship it",
      status: "Done",
      assignee: "Binh",
      url: "https://acme.atlassian.net/browse/ABC-7",
    });
  });

  test("jira_list_projects maps values to key/name/id", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        values: [
          { id: "10001", key: "ABC", name: "Alpha", extra: "ignored" },
          { id: "10002", key: "XYZ", name: "Zeta" },
        ],
      }),
    );
    const r = (await jira.handlers.jira_list_projects({}, CREDS)) as {
      projects: { key: string; name: string; id: string }[];
    };
    expect(r.projects).toEqual([
      { key: "ABC", name: "Alpha", id: "10001" },
      { key: "XYZ", name: "Zeta", id: "10002" },
    ]);
  });

  test("jira_add_comment POSTs an ADF body and returns ok + id", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ id: "99" }));
    const r = (await jira.handlers.jira_add_comment({ key: "ABC-1", body: "Looks good" }, CREDS)) as {
      ok: boolean;
      id: string;
    };
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://acme.atlassian.net/rest/api/3/issue/ABC-1/comment");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      body: {
        type: "doc",
        version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text: "Looks good" }] }],
      },
    });
    expect(r).toEqual({ ok: true, id: "99" });
  });

  test("jira_create_issue POSTs fields (with ADF description) and returns key + url", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ id: "5", key: "ABC-42" }));
    const r = (await jira.handlers.jira_create_issue(
      { projectKey: "ABC", summary: "New thing", issueType: "Bug", description: "Repro steps" },
      CREDS,
    )) as { key: string; url: string };
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://acme.atlassian.net/rest/api/3/issue");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      fields: {
        project: { key: "ABC" },
        summary: "New thing",
        issuetype: { name: "Bug" },
        description: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: "Repro steps" }] }],
        },
      },
    });
    expect(r).toEqual({ key: "ABC-42", url: "https://acme.atlassian.net/browse/ABC-42" });
  });

  test("jira_create_issue defaults issueType to Task and omits description when absent", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ key: "ABC-43" }));
    await jira.handlers.jira_create_issue({ projectKey: "ABC", summary: "Minimal" }, CREDS);
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as { fields: Record<string, unknown> };
    expect(payload.fields.issuetype).toEqual({ name: "Task" });
    expect("description" in payload.fields).toBe(false);
  });
});
