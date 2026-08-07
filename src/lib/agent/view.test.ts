import { describe, it, expect } from "vitest";
import { deriveFromToolResult, pickTurnView, MAX_ROWS, viewKey} from "./view";

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

  it("object 'not found' kiểu { hint, master_record: null } → null, không dựng panel từ gợi ý nội bộ cho model", () => {
    expect(
      deriveFromToolResult(
        "kg_get_master_record",
        { hint: "Project has no master record — use kg_search or kg_query to synthesize an answer from the graph.", master_record: null },
        AT,
      ),
    ).toBeNull();
  });

  it("object có ≥2 field NULL/undefined nhưng chỉ 1 field có giá trị thật → null", () => {
    expect(deriveFromToolResult("t", { a: "x", b: null, c: undefined }, AT)).toBeNull();
  });

  it("một con số → stat", () => {
    expect(deriveFromToolResult("t", 666, AT)?.kind).toBe("stat");
  });

  // Critical 2 (final review): stat KHÔNG có columns → DisplayPanel chỉ render bảng
  // khi columns.length > 0, nên panel rỗng trơn dù pointer vẫn đọc "bảng đang hiện".
  it("stat có columns — DisplayPanel render bảng theo cột này, không được rỗng", () => {
    const d = deriveFromToolResult("kg_count_open_tickets", 666, AT);
    expect(d?.columns).toEqual([{ key: "value", label: "kg_count_open_tickets", align: "right" }]);
    expect(d?.rows).toEqual([{ value: 666 }]);
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

  it("record mới hơn thắng table cũ hơn — list→describe, describe mới là câu trả lời", () => {
    const rec = deriveFromToolResult("r", { a: 1, b: 2 }, AT)!;
    expect(pickTurnView([table("t")!, rec])?.kind).toBe("record");
  });

  it("luôn lấy phần tử CUỐI bất kể kind — không còn ưu tiên table/chart", () => {
    const rec = deriveFromToolResult("r", { a: 1, b: 2 }, AT)!;
    expect(pickTurnView([rec, table("t")!])?.kind).toBe("table");
  });

  it("rỗng → null", () => {
    expect(pickTurnView([])).toBeNull();
  });
});

// Shapes taken from a real async query tool (chat_tool_call, 2026-08-06). Each of these was a
// silent failure before: rows two levels deep were invisible, a capped result reported its
// partial size as the whole answer, and every panel of a turn carried the same tool-name title.
describe("async query result shape", () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ refund_id: `REF-${i}`, store_id: "PH-001", amount: i }));

  const payload = (n: number, rowCount: number) => ({
    status: "completed",
    natural_language_query: "Show every refund processed by Sarah Miller.",
    results: { columns: ["refund_id", "store_id", "amount"], rows: rows(n), row_count: rowCount },
  });

  it("finds rows nested two levels down", () => {
    const d = deriveFromToolResult("kg_query_datasource_status", payload(12, 12), 1);
    expect(d?.kind).toBe("table");
    expect(d?.rows?.length).toBe(12);
  });

  // The caller asked for max_rows=50 and got 50 of 62. Reporting "50 rows" as the answer is
  // the failure; the sibling row_count is the truth.
  it("reports the real total from the sibling count, not the array length", () => {
    const d = deriveFromToolResult("kg_query_datasource_status", payload(50, 62), 1);
    expect(d?.truncated).toEqual({ shown: 50, total: 62 });
  });

  it("does not claim truncation when the array IS the whole answer", () => {
    const d = deriveFromToolResult("kg_query_datasource_status", payload(12, 12), 1);
    expect(d?.truncated).toBeUndefined();
  });

  // Several panels in one turn all come from the same tool; the tool name labels them
  // identically and says nothing about which is which.
  it("titles the panel with the question, not the tool name", () => {
    const d = deriveFromToolResult("kg_query_datasource_status", payload(12, 12), 1);
    expect(d?.title).toBe("Show every refund processed by Sarah Miller.");
  });

  it("an explicit title still wins over the payload", () => {
    const d = deriveFromToolResult("kg_query_datasource_status", payload(12, 12), 1, "Câu hỏi gốc");
    expect(d?.title).toBe("Câu hỏi gốc");
  });
});

// Column ORDER is part of the answer. The payload serialises row keys alphabetically, so
// Object.keys() put approving_manager_id / customer_id / days_after_purchase first and pushed
// refund_id and refund_amount off the right edge — a table that is technically complete and
// practically unreadable. The result declares its own order beside the rows; use it.
describe("column order follows the result's own declaration", () => {
  const declared = ["refund_id", "refund_amount", "store_id"];
  const rows = Array.from({ length: 12 }, (_, i) => ({
    // deliberately NOT in declared order, as JSON key order arrives
    approving_manager_id: "EMP-0001",
    store_id: "PH-001",
    refund_amount: i,
    refund_id: `REF-${i}`,
  }));

  it("leads with the declared columns", () => {
    const d = deriveFromToolResult("q", { results: { columns: declared, rows } }, 1);
    expect(d?.columns?.slice(0, 3).map((c) => c.key)).toEqual(declared);
  });

  // Dropping a column the result did not declare would hide data without saying so.
  it("keeps undeclared columns rather than dropping them", () => {
    const d = deriveFromToolResult("q", { results: { columns: declared, rows } }, 1);
    expect(d?.columns?.map((c) => c.key)).toContain("approving_manager_id");
  });

  it("falls back to the row's own key order when nothing is declared", () => {
    const d = deriveFromToolResult("q", { results: { rows } }, 1);
    expect(d?.columns?.[0].key).toBe("approving_manager_id");
  });
});

// Duplicate tables were the loudest thing wrong with the panel in use: one turn produced two
// identical 50/62 tables live, and a reloaded conversation stacked several under one message.
describe("viewKey identifies a table by its data", () => {
  const make = (title: string, first: Record<string, unknown>, n = 12) =>
    deriveFromToolResult("q", {
      natural_language_query: title,
      results: { rows: [first, ...Array.from({ length: n - 1 }, (_, i) => ({ ...first, a: i + 1 }))] },
    }, 1)!;

  it("treats the same data under a rephrased title as the SAME table", () => {
    const a = make("list all refunds processed by X", { a: 0, b: "x" });
    const b = make("Show all refund records processed by X", { a: 0, b: "x" });
    expect(a.title).not.toBe(b.title);
    expect(viewKey(a)).toBe(viewKey(b));
  });

  it("keeps genuinely different data apart", () => {
    expect(viewKey(make("q", { a: 0, b: "x" }))).not.toBe(viewKey(make("q", { a: 99, b: "y" })));
  });
});
