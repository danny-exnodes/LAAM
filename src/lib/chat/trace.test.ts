import { describe, expect, test } from "vitest";
import { summarizeArgs, deriveCitations, makeFrameCollector } from "./trace";
import type { ChatMessage } from "@/lib/agent/orchestrator";

describe("summarizeArgs", () => {
  test("internal: hiện key=value an toàn", () => {
    expect(summarizeArgs({ thresholdMin: 10 }, true)).toBe("thresholdMin=10");
  });
  test("connector: KHÔNG hiện giá trị (redact), chỉ số tham số", () => {
    expect(summarizeArgs({ key: "secret", token: "abc" }, false)).toBe("2 tham số");
  });
  test("string JSON được parse", () => {
    expect(summarizeArgs('{"status":"running"}', true)).toBe("status=running");
  });
  test("rỗng → undefined", () => {
    expect(summarizeArgs({}, true)).toBeUndefined();
    expect(summarizeArgs("not json", true)).toBeUndefined();
  });
});

describe("deriveCitations", () => {
  const base: ChatMessage[] = [{ role: "system", content: "s" }, { role: "user", content: "u" }];
  test("chỉ tool có dữ liệu vào Nguồn; loại {error} và rỗng", () => {
    const convo: ChatMessage[] = [
      ...base,
      { role: "assistant", content: "", tool_calls: [
        { function: { name: "laam_list_agents" } },
        { function: { name: "laam_get_agent" } },
        { function: { name: "laam_find_stuck" } },
      ] },
      { role: "tool", content: JSON.stringify([{ id: "a1" }]) },
      { role: "tool", content: JSON.stringify({ error: "không tìm thấy" }) },
      { role: "tool", content: JSON.stringify([]) },
      { role: "assistant", content: "xong" },
    ];
    expect(deriveCitations(convo, base.length)).toEqual(["laam_list_agents"]);
  });
  test("dedupe tên tool", () => {
    const convo: ChatMessage[] = [
      ...base,
      { role: "assistant", content: "", tool_calls: [{ function: { name: "laam_query_stats" } }] },
      { role: "tool", content: JSON.stringify({ kpi: 1 }) },
      { role: "assistant", content: "", tool_calls: [{ function: { name: "laam_query_stats" } }] },
      { role: "tool", content: JSON.stringify({ kpi: 2 }) },
    ];
    expect(deriveCitations(convo, base.length)).toEqual(["laam_query_stats"]);
  });
});

describe("makeFrameCollector", () => {
  test("gán c theo cặp call→result; redact args connector", () => {
    const internal = new Set(["laam_find_stuck"]);
    const { onEvent, frames } = makeFrameCollector(internal);
    onEvent({ type: "tool_call", name: "laam_find_stuck", args: { thresholdMin: 10 } });
    onEvent({ type: "tool_result", name: "laam_find_stuck", ok: true, bytes: 12 });
    onEvent({ type: "tool_call", name: "github_list_repos", args: { token: "x" } });
    onEvent({ type: "tool_result", name: "github_list_repos", ok: false, bytes: 0 });
    expect(frames).toEqual([
      { t: "tool", phase: "call", c: 0, name: "laam_find_stuck", args: "thresholdMin=10" },
      { t: "tool", phase: "result", c: 0, name: "laam_find_stuck", ok: true },
      { t: "tool", phase: "call", c: 1, name: "github_list_repos", args: "1 tham số" },
      { t: "tool", phase: "result", c: 1, name: "github_list_repos", ok: false },
    ]);
  });
});
