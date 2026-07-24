import { describe, expect, test } from "vitest";
import { validateArgs, boundOutput, guard, checkRequestedTool } from "./guardrails";
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

  // INTENT (Rule 9): một single-object result KHÔNG-mảng vừa trong maxBytes phải qua NGUYÊN VẸN.
  // Đây là ca master record (kg_get_master_record) — Cảng Định An v3's là ~78k (đo thật, lớn hơn
  // Dasin's ~46k, chính là ca làm lộ ra CLOUD_RESULT_BOUND cũ (60k) còn quá chật). Với default 8k
  // nó bị thay bằng preview+note "gọi lại hẹp hơn" (vô nghĩa với 1 record → model flail); với
  // trần cloud hiện tại (120k) nó lọt trọn để model đọc được ## risk / redFlags. Phải fail nếu ai
  // hạ trần về dưới một payload thực tế đã đo được.
  test("object đơn lớn (master record, ~78k) qua nguyên vẹn khi maxBytes đủ cao — KHÔNG shred", () => {
    const record = { master_record: { record_body: "## risk\n" + "x".repeat(78_000) + "\nredFlags" } };
    const raw = boundOutput(record, 120_000) as Record<string, unknown>;
    expect(raw).toEqual(record); // nguyên vẹn — không _truncated, không note
    expect((raw as { _truncated?: boolean })._truncated).toBeUndefined();
    // Ngược lại: default 8k thì CHÍNH record đó bị thay bằng preview+note (regression cũ).
    const shredded = boundOutput(record) as Record<string, unknown>;
    expect(shredded._truncated).toBe(true);
    expect(String(shredded.note)).toContain("RÚT GỌN");
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

// P1 review-fix: requestedTool từ picker phải qua CÙNG chuẩn validateArgs như
// internal tools (defense-in-depth tại trust boundary /api/chat) — fail-fast 400
// thay vì để args hỏng trôi xuống connector handler.
describe("checkRequestedTool (P1 quick-tools boundary)", () => {
  const tools = [
    { function: { name: "mcp__daab__kg_query", parameters: params } }, // required: id
    { function: { name: "demo_list_tasks", parameters: { type: "object", properties: {} } } },
  ];

  test("null/không phải object → null (không có requestedTool)", () => {
    expect(checkRequestedTool(undefined, tools)).toBeNull();
    expect(checkRequestedTool(null, tools)).toBeNull();
  });

  test("tên ngoài union → {ok:false}", () => {
    const r = checkRequestedTool({ name: "tool_la", args: {} }, tools);
    expect(r).toMatchObject({ ok: false });
  });

  test("thiếu required arg → {ok:false} nêu tên tham số", () => {
    const r = checkRequestedTool({ name: "mcp__daab__kg_query", args: {} }, tools);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/id/);
  });

  test("sai kiểu → {ok:false}", () => {
    const r = checkRequestedTool({ name: "mcp__daab__kg_query", args: { id: "x", limit: "không-phải-số" } }, tools);
    expect(r).toMatchObject({ ok: false });
  });

  test("hợp lệ → {ok:true, value} args đã chuẩn hoá", () => {
    const r = checkRequestedTool({ name: "mcp__daab__kg_query", args: { id: "1f99", limit: 5 } }, tools);
    expect(r).toEqual({ ok: true, value: { name: "mcp__daab__kg_query", args: { id: "1f99", limit: 5 } } });
  });
});
