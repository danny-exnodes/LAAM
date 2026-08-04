import { describe, expect, test } from "vitest";
import { buildPreview } from "./preview";

describe("buildPreview", () => {
  test("trello_create_card → title/summary/fields đúng", () => {
    const p = buildPreview("trello_create_card", { idList: "l1", name: "Mua sữa" });
    expect(p.title).toBe("Tạo card Trello");
    expect(p.summary).toContain("Mua sữa");
    expect(p.fields).toEqual([
      { label: "Danh sách", value: "l1" },
      { label: "Tiêu đề", value: "Mua sữa" },
    ]);
  });
  test("desc tuỳ chọn được thêm khi có", () => {
    const p = buildPreview("trello_create_card", { idList: "l1", name: "X", desc: "ghi chú" });
    expect(p.fields.some((f) => f.label === "Mô tả" && f.value === "ghi chú")).toBe(true);
  });
  test("demo_create_task → title/summary/fields (FEAT-5)", () => {
    const p = buildPreview("demo_create_task", { title: "Chuẩn bị họp", status: "doing" });
    expect(p.title).toBe("Tạo công việc (demo)");
    expect(p.summary).toContain("Chuẩn bị họp");
    expect(p.fields).toEqual([
      { label: "Tên", value: "Chuẩn bị họp" },
      { label: "Trạng thái", value: "doing" },
    ]);
  });
  test("tool lạ → preview tổng quát liệt kê args", () => {
    const p = buildPreview("future_write", { a: "1" });
    expect(p.title).toBe("Hành động ghi");
    expect(p.fields).toEqual([{ label: "a", value: "1" }]);
  });
  test("redact arg nhạy cảm trong field (không lộ secret lên card)", () => {
    const p = buildPreview("future_write", { url: "x?token=abc123def456ghi" });
    expect(p.fields[0].value).toContain("‹redacted›");
  });
  // Card là thứ user duyệt TRƯỚC khi cho phép ghi (Rule 13) — args dạng object (vd
  // `values` của kg_insert_datasource_row) phải hiện đúng nội dung JSON, không phải
  // "[object Object]" (che mất chính dữ liệu sắp được ghi).
  test("args là object/array → render JSON, không phải [object Object]", () => {
    const p = buildPreview("mcp__daab__kg_insert_datasource_row", {
      table: "customers",
      values: { customer_id: "CUS-1", first_name: "Lan" },
      tags: ["a", "b"],
    });
    const values = p.fields.find((f) => f.label === "values")!.value;
    expect(values).not.toContain("[object Object]");
    expect(values).toContain('"customer_id":"CUS-1"');
    expect(p.fields.find((f) => f.label === "tags")!.value).toBe('["a","b"]');
  });
  test("secret NESTED trong object vẫn bị redact trước khi render JSON", () => {
    const p = buildPreview("future_write", { cfg: { url: "x?token=abc123def456ghi" } });
    expect(p.fields[0].value).toContain("‹redacted›");
    expect(p.fields[0].value).not.toContain("abc123def456ghi");
  });
});
