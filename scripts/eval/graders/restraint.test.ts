import { describe, expect, test } from "vitest";
import { gradeRestraint } from "./restraint";
import type { RunTrace } from "../types";

const trace = (names: string[]): RunTrace =>
  ({ convo: [], calls: names.map((n) => ({ name: n, args: {} })), rounds: 0, finalText: "", ms: 0 });

describe("gradeRestraint", () => {
  test("pass khi không gọi tool cấm", () =>
    expect(gradeRestraint(trace([]), ["laam_query_stats"]).pass).toBe(true));
  test("fail khi gọi tool đáng lẽ không nên (over-call)", () => {
    const r = gradeRestraint(trace(["laam_query_stats"]), ["laam_query_stats"]);
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("laam_query_stats");
  });
});
