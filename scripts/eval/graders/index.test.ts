import { describe, expect, test } from "vitest";
import { runGraders } from "./index";
import type { RunTrace, Scenario } from "../types";

const baseTrace: RunTrace = { convo: [], calls: [{ name: "laam_find_stuck", args: {} }], rounds: 1, finalText: "Project billing-svc đang kẹt.", ms: 100 };

describe("runGraders", () => {
  test("chỉ chấm chiều mà expect khai báo", () => {
    const s: Scenario = {
      id: "x", capability: "tool-selection", input: "?",
      expect: { callsTool: "laam_find_stuck", notCalls: ["laam_query_stats"], finalContains: ["billing-svc"] },
    };
    const res = runGraders(baseTrace, s);
    const dims = res.map((r) => r.dim).sort();
    expect(dims).toEqual(["grounding", "restraint", "tool-selection"]);
    expect(res.every((r) => r.pass)).toBe(true);
  });

  test("không khai báo args/maxRounds/emitsBlock → bỏ qua các chiều đó", () => {
    const s: Scenario = { id: "y", capability: "restraint", input: "?", expect: { notCalls: [] } };
    expect(runGraders(baseTrace, s).map((r) => r.dim)).toEqual(["restraint"]);
  });
});
