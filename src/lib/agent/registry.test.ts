import { describe, expect, test, vi } from "vitest";

// Mock connectors.execute để kiểm route fallback (tên không phải internal).
vi.mock("@/lib/connectors", () => ({ execute: vi.fn(async () => ({ from: "connector" })) }));
// registry → tools/laam → @/db (pg Pool); stub để load dưới jsdom.
vi.mock("@/db", () => ({ db: {} }));

import { modelToolSchemas, makeDispatch } from "./registry";
import { execute } from "@/lib/connectors";
import type { Tool, ToolEvent } from "./types";

const internal: Tool[] = [
  {
    name: "laam_ping", description: "", kind: "read",
    parameters: { type: "object", properties: {} },
    handler: async () => ({ from: "internal" }),
  },
];
const connTool = { type: "function" as const, kind: "read" as const, function: { name: "github_list_repos", description: "", parameters: {} } };
const connWrite = { type: "function" as const, kind: "write" as const, function: { name: "trello_create_card", description: "", parameters: {} } };

describe("modelToolSchemas", () => {
  test("ghép internal (đã map) + connector — không có write thì giữ nguyên thứ tự", () => {
    const out = modelToolSchemas(internal, [connTool]);
    expect(out.map((t) => t.function.name)).toEqual(["laam_ping", "github_list_repos"]);
  });
  test("giữ NGUYÊN thứ tự nối (QW-1 write-first sort đã REVERT — chưa chứng minh, write-probe noisy)", () => {
    // internal trước, rồi connector theo thứ tự truyền vào; write KHÔNG bị đẩy lên.
    const out = modelToolSchemas(internal, [connTool, connWrite]);
    expect(out.map((t) => t.function.name)).toEqual(["laam_ping", "github_list_repos", "trello_create_card"]);
  });
});

describe("makeDispatch", () => {
  const ctx = { userId: "u1", now: 0, lang: "vi" };
  test("tên internal → handler nội bộ, có onEvent", async () => {
    const events: ToolEvent[] = [];
    const d = makeDispatch(internal, ctx, (e) => events.push(e));
    expect(await d("laam_ping", {})).toEqual({ from: "internal" });
    expect(events[0].type).toBe("tool_call");
    expect(events[1].type).toBe("tool_result");
  });
  test("tên lạ → fallback connectors.execute(userId,...)", async () => {
    const d = makeDispatch(internal, ctx);
    expect(await d("github_list_repos", { a: 1 })).toEqual({ from: "connector" });
    expect(execute).toHaveBeenCalledWith("u1", "github_list_repos", { a: 1 });
  });
});
