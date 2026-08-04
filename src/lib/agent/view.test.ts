import { describe, it, expect } from "vitest";
import { deriveFromToolResult, pickTurnView, MAX_ROWS } from "./view";

const AT = 1_700_000_000_000;

describe("deriveFromToolResult", () => {
  it("mảng object đồng nhất → table, cột lấy từ khoá của dòng đầu", () => {
    const d = deriveFromToolResult("kg_list_stores", [
      { store_id: "PH-005", variance: 1015 },
      { store_id: "PH-003", variance: 542 },
    ], AT);
    expect(d?.kind).toBe("table");
    expect(d?.columns?.map((c) => c.key)).toEqual(["store_id", "variance"]);
    expect(d?.rows).toHaveLength(2);
    expect(d?.source).toEqual({ type: "tool", toolName: "kg_list_stores", at: AT });
  });

  it("cột số canh phải, cột chữ canh trái — để bảng đọc được khi liếc", () => {
    const d = deriveFromToolResult("t", [
      { name: "a", n: 1 },
      { name: "b", n: 2 },
    ], AT);
    expect(d?.columns).toEqual([
      { key: "name", label: "name", align: "left" },
      { key: "n", label: "n", align: "right" },
    ]);
  });

  it("có cột số + cột nhãn và đủ ngắn → gợi ý bar chart", () => {
    const d = deriveFromToolResult("t", [
      { store: "PH-005", variance: 1015 },
      { store: "PH-003", variance: 542 },
    ], AT);
    expect(d?.chart).toEqual({ type: "bar", labelKey: "store", valueKey: "variance" });
  });

  it("quá 25 dòng thì KHÔNG gợi ý chart — bar 26 cột là nhiễu, không phải thông tin", () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({ store: `S${i}`, variance: i }));
    expect(deriveFromToolResult("t", rows, AT)?.chart).toBeUndefined();
  });

  it("mảng dài bị cắt còn MAX_ROWS và ghi lại tổng thật — không im lặng cắt bớt", () => {
    const rows = Array.from({ length: 666 }, (_, i) => ({ product: `P${i}`, qty: -i }));
    const d = deriveFromToolResult("t", rows, AT);
    expect(d?.rows).toHaveLength(MAX_ROWS);
    expect(d?.truncated).toEqual({ shown: MAX_ROWS, total: 666 });
  });

  it("kết quả MCP dạng { text: '<json>' } cũng nhận ra", () => {
    const raw = { text: JSON.stringify([{ a: "x", b: 1 }, { a: "y", b: 2 }]) };
    expect(deriveFromToolResult("t", raw, AT)?.kind).toBe("table");
  });

  it("mảng nằm sâu trong object cũng tìm ra (tool không neo cứng khoá)", () => {
    const raw = { ok: true, stores: [{ a: "x", b: 1 }, { a: "y", b: 2 }] };
    expect(deriveFromToolResult("t", raw, AT)?.rows).toHaveLength(2);
  });

  it("object đơn nhiều field → record", () => {
    const d = deriveFromToolResult("t", { store_id: "PH-001", city: "Frisco", open: true }, AT);
    expect(d?.kind).toBe("record");
    expect(d?.rows).toEqual([{ store_id: "PH-001", city: "Frisco", open: true }]);
  });

  it("một con số → stat", () => {
    expect(deriveFromToolResult("t", 666, AT)?.kind).toBe("stat");
  });

  it("shape không nhận ra → null, KHÔNG dựng panel rỗng", () => {
    expect(deriveFromToolResult("t", null, AT)).toBeNull();
    expect(deriveFromToolResult("t", { text: "không phải json" }, AT)).toBeNull();
    expect(deriveFromToolResult("t", [], AT)).toBeNull();
    expect(deriveFromToolResult("t", ["a", "b"], AT)).toBeNull();
  });

  it("mảng object nhưng khác bộ khoá → null (không phải bảng)", () => {
    expect(deriveFromToolResult("t", [{ a: 1 }, { b: 2 }], AT)).toBeNull();
  });
});

describe("pickTurnView", () => {
  const table = (name: string): ReturnType<typeof deriveFromToolResult> =>
    deriveFromToolResult(name, [{ a: "x", b: 1 }, { a: "y", b: 2 }], AT);

  it("lấy table CUỐI CÙNG — bước 2 của drilldown mới là thứ user hỏi", () => {
    const picked = pickTurnView([table("list")!, table("detail")!]);
    expect(picked?.source).toMatchObject({ toolName: "detail" });
  });

  it("không có table thì mới lấy record/stat cuối", () => {
    const rec = deriveFromToolResult("r", { a: 1, b: 2 }, AT)!;
    expect(pickTurnView([rec])?.kind).toBe("record");
  });

  it("table thắng record kể cả khi record đến sau", () => {
    const rec = deriveFromToolResult("r", { a: 1, b: 2 }, AT)!;
    expect(pickTurnView([table("t")!, rec])?.kind).toBe("table");
  });

  it("rỗng → null", () => {
    expect(pickTurnView([])).toBeNull();
  });
});
