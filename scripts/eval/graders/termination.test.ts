import { describe, expect, test } from "vitest";
import { gradeTermination } from "./termination";
import type { RunTrace } from "../types";

const trace = (rounds: number): RunTrace => ({ convo: [], calls: [], rounds, finalText: "", ms: 0 });

describe("gradeTermination", () => {
  test("pass khi dừng trong ngưỡng", () => expect(gradeTermination(trace(1), 2).pass).toBe(true));
  test("fail khi lặp quá ngưỡng", () => {
    const r = gradeTermination(trace(3), 2);
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("3");
  });
});
