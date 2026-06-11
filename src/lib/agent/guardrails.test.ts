import { describe, expect, test } from "vitest";
import { validateArgs, boundOutput, guard } from "./guardrails";
import type { Tool } from "./types";

const params = {
  type: "object",
  properties: { id: { type: "string" }, limit: { type: "number" } },
  required: ["id"],
};

describe("validateArgs", () => {
  test("ok khi đủ required + đúng kiểu", () => {
    expect(validateArgs(params, { id: "a", limit: 5 }).ok).toBe(true);
  });
  test("lỗi khi thiếu required", () => {
    expect(validateArgs(params, { limit: 5 }).ok).toBe(false);
  });
  test("lỗi khi sai kiểu", () => {
    expect(validateArgs(params, { id: "a", limit: "x" }).ok).toBe(false);
  });
  test("args không phải object → lỗi", () => {
    expect(validateArgs(params, 42).ok).toBe(false);
  });
  test("mảng không được coi là object hợp lệ", () => {
    expect(validateArgs(params, [1, 2]).ok).toBe(false);
  });
});

describe("boundOutput", () => {
  test("giữ nguyên khi nhỏ", () => {
    expect(boundOutput({ a: 1 })).toEqual({ a: 1 });
  });
  test("cắt + đánh dấu khi quá ngưỡng", () => {
    const out = boundOutput({ s: "x".repeat(20) }, 10) as { _truncated?: boolean };
    expect(out._truncated).toBe(true);
  });
  test("undefined → trả error rõ ràng", () => {
    const out = boundOutput(undefined) as { error?: string };
    expect(out.error).toBeTruthy();
  });

  // INTENT (Rule 9): khi list-result quá lớn, model PHẢI nhận được mẫu JSON HỢP LỆ + tổng số
  // + chỉ dẫn thu hẹp — KHÔNG phải slice-JSON-hỏng. Đây chính là cái cứu "Dữ liệu bị cắt ngắn".
  test("object có mảng lớn → giữ field khác, mẫu HỢP LỆ (phần tử nguyên vẹn), kèm total + note", () => {
    const agents = Array.from({ length: 200 }, (_, i) => ({ id: "a" + i, costUsd: i, latestActivity: "x".repeat(40) }));
    const out = boundOutput({ totals: { count: 200 }, agents }, 2000) as Record<string, unknown>;
    expect(out._truncated).toBe(true);
    expect(out.totals).toEqual({ count: 200 }); // field không-mảng giữ nguyên
    expect(out.agents__total).toBe(200); // model biết tổng thật để quyết thu hẹp
    const sample = out.agents as Array<{ id: string }>;
    expect(Array.isArray(sample)).toBe(true);
    expect(sample.length).toBeGreaterThan(0);
    expect(sample.length).toBeLessThan(200); // đã cắt
    expect(sample[0].id).toBe("a0"); // phần tử ĐẦU nguyên vẹn (không bị xén giữa chừng)
    expect(String(out.note)).toContain("RÚT GỌN");
    // Toàn bộ kết quả vẫn là JSON hợp lệ + trong ngân sách (không thể "hỏng" như slice cũ).
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(2400);
  });

  test("mảng trần lớn → { sample, total, shown } hợp lệ", () => {
    const arr = Array.from({ length: 100 }, (_, i) => ({ n: i, pad: "y".repeat(30) }));
    const out = boundOutput(arr, 500) as Record<string, unknown>;
    expect(out._truncated).toBe(true);
    expect(out.total).toBe(100);
    const sample = out.sample as unknown[];
    expect(sample.length).toBeGreaterThan(0);
    expect(sample.length).toBeLessThan(100);
    expect(out.shown).toBe(sample.length);
  });
});

describe("guard", () => {
  test("chặn args sai trước khi gọi handler", async () => {
    let called = false;
    const t: Tool = {
      name: "laam_x", description: "", kind: "read", parameters: params,
      handler: async () => { called = true; return { ok: true }; },
    };
    const res = (await guard(t).handler({}, { userId: "u", now: 0, lang: "vi" })) as { error?: string };
    expect(called).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
