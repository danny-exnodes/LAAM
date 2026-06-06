import { afterEach, describe, expect, test, vi } from "vitest";
import github from "./github";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("github connector", () => {
  test("identity + tool names", () => {
    expect(github.id).toBe("github");
    expect(github.auth.type).toBe("token");
    expect(github.tools.map((t) => t.function.name)).toEqual([
      "github_list_repos",
      "github_list_issues",
      "github_search_issues",
      "github_get_repo",
      "github_list_commits",
      "github_list_pull_requests",
      "github_create_issue",
      "github_comment_issue",
    ]);
  });

  test("write tools are declared kind:write, reads are kind:read", () => {
    const kindOf = (name: string) => github.tools.find((t) => t.function.name === name)?.kind;
    expect(kindOf("github_get_repo")).toBe("read");
    expect(kindOf("github_list_commits")).toBe("read");
    expect(kindOf("github_list_pull_requests")).toBe("read");
    expect(kindOf("github_create_issue")).toBe("write");
    expect(kindOf("github_comment_issue")).toBe("write");
  });

  test("github_list_repos maps full_name to name", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json([
        { full_name: "octo/repo", private: false, stargazers_count: 5, language: "TS", html_url: "u" },
      ]),
    );
    const r = (await github.handlers.github_list_repos({}, { token: "t" })) as {
      repos: { name: string; stars: number }[];
    };
    expect(r.repos[0].name).toBe("octo/repo");
    expect(r.repos[0].stars).toBe(5);
  });

  test("github_list_issues filters out pull requests", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json([
        { number: 1, title: "real issue", state: "open", labels: [] },
        { number: 2, title: "a PR", state: "open", labels: [], pull_request: { url: "x" } },
      ]),
    );
    const r = (await github.handlers.github_list_issues(
      { owner: "octo", repo: "repo" },
      { token: "t" },
    )) as { issues: { number: number }[] };
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].number).toBe(1);
  });

  test("test() returns ok with @login", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ login: "octocat" }));
    const r = await github.test!({ token: "t" });
    expect(r.ok).toBe(true);
    expect(r.info).toContain("@octocat");
  });

  test("non-ok response throws with message", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ message: "Bad credentials" }, { status: 401 }),
    );
    await expect(github.handlers.github_list_repos({}, { token: "x" })).rejects.toThrow(
      "Bad credentials",
    );
  });

  test("github_get_repo shapes a single repo", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        full_name: "octo/repo",
        private: true,
        stargazers_count: 9,
        language: "Go",
        html_url: "u",
      }),
    );
    const r = (await github.handlers.github_get_repo(
      { owner: "octo", repo: "repo" },
      { token: "t" },
    )) as { repo: { name: string; private: boolean; stars: number } };
    expect(r.repo.name).toBe("octo/repo");
    expect(r.repo.private).toBe(true);
    expect(r.repo.stars).toBe(9);
  });

  test("github_list_commits takes first message line and short sha", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json([
        {
          sha: "abcdef1234567890",
          commit: { message: "fix: thing\n\ndetails here", author: { name: "Ann", date: "2026-01-01" } },
          html_url: "u",
        },
      ]),
    );
    const r = (await github.handlers.github_list_commits(
      { owner: "octo", repo: "repo" },
      { token: "t" },
    )) as { commits: { sha: string; message: string; author: string; date: string }[] };
    expect(r.commits[0].sha).toBe("abcdef1");
    expect(r.commits[0].message).toBe("fix: thing");
    expect(r.commits[0].author).toBe("Ann");
  });

  test("github_list_commits caps per_page at 30", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json([]));
    await github.handlers.github_list_commits(
      { owner: "octo", repo: "repo", limit: 999 },
      { token: "t" },
    );
    expect(String(spy.mock.calls[0][0])).toContain("per_page=30");
  });

  test("github_list_pull_requests maps fields and defaults state=open", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json([
        {
          number: 7,
          title: "a pr",
          state: "open",
          user: { login: "dev" },
          html_url: "u",
          updated_at: "2026-01-02",
        },
      ]),
    );
    const r = (await github.handlers.github_list_pull_requests(
      { owner: "octo", repo: "repo" },
      { token: "t" },
    )) as { pulls: { number: number; author: string; title: string }[] };
    expect(r.pulls[0].number).toBe(7);
    expect(r.pulls[0].author).toBe("dev");
    expect(String(spy.mock.calls[0][0])).toContain("state=open");
  });

  test("github_create_issue POSTs title+body and returns number/url", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ number: 42, html_url: "https://gh/issues/42", title: "Bug" }),
    );
    const r = (await github.handlers.github_create_issue(
      { owner: "octo", repo: "repo", title: "Bug", body: "broken" },
      { token: "t" },
    )) as { issue: { number: number; url: string; title: string } };
    expect(r.issue.number).toBe(42);
    expect(r.issue.url).toBe("https://gh/issues/42");
    expect(r.issue.title).toBe("Bug");
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain("/repos/octo/repo/issues");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ title: "Bug", body: "broken" });
  });

  test("github_comment_issue POSTs body to the issue's comments endpoint", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ html_url: "https://gh/issues/5#c1" }),
    );
    const r = (await github.handlers.github_comment_issue(
      { owner: "octo", repo: "repo", number: 5, body: "thanks" },
      { token: "t" },
    )) as { ok: boolean; url: string };
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://gh/issues/5#c1");
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain("/repos/octo/repo/issues/5/comments");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ body: "thanks" });
  });

  test("POST preserves Authorization + Accept headers alongside Content-Type", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json({ number: 1, html_url: "u", title: "t" }));
    await github.handlers.github_create_issue(
      { owner: "octo", repo: "repo", title: "t" },
      { token: "tok" },
    );
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok");
    expect(headers["Accept"]).toBe("application/vnd.github+json");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
