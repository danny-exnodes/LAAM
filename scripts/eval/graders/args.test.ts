import { describe, expect, test } from "vitest";
import { gradeArgs } from "./args";
import type { RunTrace } from "../types";

const trace = (calls: { name: string; args: Record<string, unknown> }[]): RunTrace =>
  ({ convo: [], calls, rounds: 1, finalText: "", ms: 0 });

describe("gradeArgs", () => {
  const expectArgs = { laam_get_agent: (a: Record<string, unknown>) => a.id === "sess-42" };

  test("pass khi args đúng (id thật từ lượt trước)", () =>
    expect(gradeArgs(trace([{ name: "laam_get_agent", args: { id: "sess-42" } }]), expectArgs).pass).toBe(true));

  test("fail khi model bịa id (vd dùng tên project làm id)", () => {
    const r = gradeArgs(trace([{ name: "laam_get_agent", args: { id: "billing-svc" } }]), expectArgs);
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("laam_get_agent");
  });

  test("fail khi không gọi tool cần kiểm args", () =>
    expect(gradeArgs(trace([]), expectArgs).pass).toBe(false));
});
