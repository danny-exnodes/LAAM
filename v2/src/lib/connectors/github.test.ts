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
    ]);
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
});
