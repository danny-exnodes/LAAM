import { describe, expect, test } from "vitest";
import { bigMasterRecord } from "./realistic-payload";

// WHY: stub cũ cho probe mcp-detail chỉ vài trăm ký tự — trong khi master record THẬT đo
// được trên production (route.ts:112-113, comment sẵn có trong repo) là ~46k (Dasin) tới
// ~78k (Cảng Định An v3) ký tự. Payload nhỏ không tạo áp lực ngữ cảnh giống thật; probe dựa
// trên nó không nói được gì về hành vi model khi tool result thật sự lớn.
describe("bigMasterRecord", () => {
  test("đạt xấp xỉ độ dài mục tiêu (sai số nhỏ do lặp theo đoạn nguyên vẹn)", () => {
    const s = bigMasterRecord(46_000);
    expect(s.length).toBeGreaterThanOrEqual(46_000);
    expect(s.length).toBeLessThan(48_000);
  });

  test("deterministic — không dùng Math.random/Date.now, hai lần gọi ra CÙNG kết quả", () => {
    expect(bigMasterRecord(20_000)).toBe(bigMasterRecord(20_000));
  });

  test("là JSON hợp lệ, giữ đúng shape master record thật (summary/strengths/risks/recommendations)", () => {
    const parsed = JSON.parse(bigMasterRecord(20_000));
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("strengths");
    expect(parsed).toHaveProperty("risks");
    expect(parsed).toHaveProperty("recommendations");
  });
});
