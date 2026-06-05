import { describe, expect, test } from "vitest";
import { gradeToolSelection } from "./tool-selection";
import type { RunTrace } from "../types";

const trace = (names: string[]): RunTrace =>
  ({ convo: [], calls: names.map((n) => ({ name: n, args: {} })), rounds: 1, finalText: "", ms: 0 });

describe("gradeToolSelection", () => {
  test("pass khi gọi đúng tool", () =>
    expect(gradeToolSelection(trace(["laam_find_stuck"]), "laam_find_stuck").pass).toBe(true));
  test("fail khi không gọi", () => {
    const r = gradeToolSelection(trace([]), "laam_find_stuck");
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("laam_find_stuck");
  });
  test("yêu cầu TẤT CẢ khi là mảng", () =>
    expect(gradeToolSelection(trace(["laam_list_agents"]), ["laam_list_agents", "laam_get_agent"]).pass).toBe(false));
});
