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
