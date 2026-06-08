import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Connector } from "./types";

// In-memory creds keyed by `${userId}:${id}`. Built inside vi.hoisted so the
// mocked store can reference them (vi.mock is hoisted above declarations).
const { memCreds, getCreds, setCreds, delCreds } = vi.hoisted(() => {
  const memCreds: Record<string, Record<string, string> | null> = {};
  return {
    memCreds,
    getCreds: vi.fn(async (u: string, id: string) => memCreds[`${u}:${id}`] ?? null),
    setCreds: vi.fn(async (u: string, id: string, c: Record<string, string>) => {
      memCreds[`${u}:${id}`] = c;
    }),
    delCreds: vi.fn(async (u: string, id: string) => {
      memCreds[`${u}:${id}`] = null;
    }),
  };
});
vi.mock("./store", () => ({ getCreds, setCreds, delCreds }));

// Fake registry: a token connector + a demo (no-auth) connector. Built inside
// vi.hoisted so they exist when the hoisted vi.mock factory runs.
const { github, demo } = vi.hoisted(() => {
  const github: Connector = {
    id: "github",
    name: "GitHub",
    icon: "github",
    blurb: "Repos",
    auth: { type: "token", help: "h", setup: "", fields: [{ key: "token", label: "Token", secret: true }] },
    tools: [{ type: "function", kind: "read", function: { name: "github_list_repos", description: "d", parameters: {} } }],
    handlers: { github_list_repos: vi.fn(async () => ({ repos: ["a"] })) },
    test: vi.fn(async () => ({ ok: true, info: "ok" })),
  };
  const demo: Connector = {
    id: "demo",
    name: "Demo",
    icon: "play",
    blurb: "Demo",
    auth: { type: "none" },
    tools: [{ type: "function", kind: "read", function: { name: "demo_list_tasks", description: "d", parameters: {} } }],
    handlers: { demo_list_tasks: vi.fn(async () => ({ tasks: [] })) },
  };
  return { github, demo };
});
vi.mock("./registry", () => ({ CONNECTORS: [github, demo] }));

import { list, isConnected, connect, disconnect, testConnector, chatTools, execute } from "./index";

beforeEach(() => {
  for (const k of Object.keys(memCreds)) delete memCreds[k];
  getCreds.mockClear();
  setCreds.mockClear();
  delCreds.mockClear();
  (github.handlers.github_list_repos as ReturnType<typeof vi.fn>).mockClear();
});

describe("isConnected", () => {
  test("token connector: false when field missing, true when set", async () => {
    expect(await isConnected("u1", "github")).toBe(false);
    memCreds["u1:github"] = { token: "ghp_x" };
    expect(await isConnected("u1", "github")).toBe(true);
  });
  test("no-auth/demo connector: connected only via _connected flag", async () => {
    expect(await isConnected("u1", "demo")).toBe(false);
    memCreds["u1:demo"] = { _connected: "true" };
    expect(await isConnected("u1", "demo")).toBe(true);
  });
  test("unknown connector → false", async () => {
    expect(await isConnected("u1", "nope")).toBe(false);
  });
});

describe("list", () => {
  test("masks secret fields (keep last 4), reports connected + tools", async () => {
    memCreds["u1:github"] = { token: "ghp_secretXYZ9", _connectedAt: "2026-06-03T00:00:00Z" };
    const items = await list("u1");
    const gh = items.find((i) => i.id === "github")!;
    expect(gh.connected).toBe(true);
    // #1: the projection now carries each tool's schema (name + description + params)
    expect(gh.tools).toEqual([{ name: "github_list_repos", description: "d", parameters: {} }]);
    expect(gh.connectedAt).toBe("2026-06-03T00:00:00Z");
    const f = gh.auth.fields[0];
    expect(f.set).toBe(true);
    expect(f.masked).toBe("••••XYZ9"); // last 4
    expect(f.masked).not.toContain("ghp_secret");
  });
  test("scopes to the given user (no creds → not connected, empty mask)", async () => {
    const items = await list("u2");
    const gh = items.find((i) => i.id === "github")!;
    expect(gh.connected).toBe(false);
    expect(gh.auth.fields[0].set).toBe(false);
    expect(gh.auth.fields[0].masked).toBe("");
  });
});

describe("connect / disconnect", () => {
  test("connect stores trimmed token fields", async () => {
    const r = await connect("u1", "github", { token: "  ghp_x  " });
    expect(r.ok).toBe(true);
    expect(memCreds["u1:github"]!.token).toBe("ghp_x");
    expect(memCreds["u1:github"]!._connectedAt).toBeTruthy();
  });
  test("connect a no-auth connector sets _connected flag", async () => {
    await connect("u1", "demo", {});
    expect(memCreds["u1:demo"]!._connected).toBe("true");
  });
  test("connect unknown connector → error", async () => {
    const r = await connect("u1", "nope", {});
    expect(r.ok).toBe(false);
  });
  test("disconnect removes creds", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    const r = await disconnect("u1", "github");
    expect(r.ok).toBe(true);
    expect(delCreds).toHaveBeenCalledWith("u1", "github");
  });
});

describe("testConnector", () => {
  test("not connected → error", async () => {
    const r = await testConnector("u1", "github");
    expect(r.ok).toBe(false);
  });
  test("connected → runs connector.test with decrypted creds", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    const r = await testConnector("u1", "github");
    expect(r.ok).toBe(true);
    expect(r.info).toBe("ok");
    expect(github.test).toHaveBeenCalledWith({ token: "ghp_x" });
  });
  test("connector without test() → ok with note", async () => {
    memCreds["u1:demo"] = { _connected: "true" };
    const r = await testConnector("u1", "demo");
    expect(r.ok).toBe(true);
  });
});

describe("chatTools", () => {
  test("returns tools of only the user's connected connectors", async () => {
    expect(await chatTools("u1")).toEqual([]);
    memCreds["u1:github"] = { token: "ghp_x" };
    const tools = await chatTools("u1");
    expect(tools.map((t) => t.function.name)).toEqual(["github_list_repos"]);
  });
});

describe("execute", () => {
  test("unknown tool → error object", async () => {
    const r = (await execute("u1", "nope_tool", {})) as { error?: string };
    expect(r.error).toBeTruthy();
  });
  test("tool of a not-connected connector → error", async () => {
    const r = (await execute("u1", "github_list_repos", {})) as { error?: string };
    expect(r.error).toBeTruthy();
  });
  test("runs the handler with parsed args + decrypted creds", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    const r = await execute("u1", "github_list_repos", '{"q":"x"}');
    expect(r).toEqual({ repos: ["a"] });
    expect(github.handlers.github_list_repos).toHaveBeenCalledWith({ q: "x" }, { token: "ghp_x" });
  });
  test("handler throw → error object (does not throw)", async () => {
    memCreds["u1:github"] = { token: "ghp_x" };
    (github.handlers.github_list_repos as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const r = (await execute("u1", "github_list_repos", {})) as { error?: string };
    expect(r.error).toContain("boom");
  });
});
