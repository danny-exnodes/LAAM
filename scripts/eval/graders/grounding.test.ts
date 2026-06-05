import { describe, expect, test } from "vitest";
import { gradeGrounding } from "./grounding";
import type { RunTrace } from "../types";

const trace = (finalText: string): RunTrace => ({ convo: [], calls: [], rounds: 1, finalText, ms: 0 });

describe("gradeGrounding", () => {
  test("pass khi câu cuối chứa sự-thật (kể cả số định dạng lại)", () => {
    const r = gradeGrounding(trace("Project billing-svc đã dùng 12.345 token."),
      { finalContains: ["billing-svc", "12345"] });
    expect(r.pass).toBe(true);
  });
  test("fail khi thiếu giá trị thật", () =>
    expect(gradeGrounding(trace("Có vài agent đang chạy."), { finalContains: ["billing-svc"] }).pass).toBe(false));
  test("fail khi bịa thứ không được nhắc (finalNotContains)", () =>
    expect(gradeGrounding(trace("Đã tạo card thành công."), { finalNotContains: ["đã tạo"] }).pass).toBe(false));
});
