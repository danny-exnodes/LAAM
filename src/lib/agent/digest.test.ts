import { describe, it, expect, afterEach} from "vitest";
import { digestToolResult, digestToolMessageContent, aggregateRows, digestMinRows, digestSampleRows } from "./digest";

// Shaped like the result that cost 103s: many rows, many columns, wrapped the way an async
// query tool wraps it (chat_tool_call, 2026-08-06).
function payload(n = 62, rowCount = n) {
  const rows = Array.from({ length: n }, (_, i) => ({
    refund_id: `REF-${String(i).padStart(6, "0")}`,
    store_id: "PH-001",
    refund_amount: 10 + i,
    refund_reason: "Product Defective — padding so this clears the size threshold",
    flag_reason: "No receipt; After 8 PM; High value — more padding",
  }));
  return {
    status: "completed",
    natural_language_query: "Show every refund processed by Sarah Miller.",
    results: { columns: Object.keys(rows[0]), rows, row_count: rowCount },
  };
}

describe("aggregateRows", () => {
  // WHY (Rule 9): the model only sees a sample, so a total it computes itself is over a
  // subset — confidently wrong. Totals must come from code, over ALL rows.
  it("totals numeric columns across every row, not just the sample", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ amount: i + 1, name: "x" }));
    expect(aggregateRows(rows).amount).toEqual({ min: 1, max: 20, sum: 210 });
  });

  it("skips a column that is not numeric in every row", () => {
    expect(aggregateRows([{ v: 1 }, { v: "n/a" }, { v: 3 }])).toEqual({});
  });
});

describe("digestToolResult", () => {
  it("replaces the rows with counts, columns, code-computed totals and a small sample", () => {
    const out = digestToolResult(payload()) as Record<string, unknown>;
    expect(out._digest).toBe(true);
    expect(out.row_count).toBe(62);
    expect(out.rows_returned_by_tool).toBe(62);
    expect((out.sample as unknown[]).length).toBe(digestSampleRows());
    // sum over ALL 62 rows (10..71), not over the 5 sampled ones
    expect((out.aggregates as Record<string, { sum: number }>).refund_amount.sum).toBe(2511);
  });

  it("keeps the surrounding fields, including the question that produced the table", () => {
    const out = digestToolResult(payload()) as Record<string, unknown>;
    expect(out.status).toBe("completed");
    expect(out.natural_language_query).toBe("Show every refund processed by Sarah Miller.");
  });

  it("shrinks the payload substantially", () => {
    const before = JSON.stringify(payload()).length;
    const after = JSON.stringify(digestToolResult(payload())).length;
    expect(after).toBeLessThan(before / 3);
  });

  it("leaves a small result completely alone", () => {
    const small = { results: { rows: [{ a: 1 }, { a: 2 }], row_count: 2 } };
    expect(digestToolResult(small)).toBe(small);
  });

  it("leaves a long result with few rows alone", () => {
    const few = { results: { rows: Array.from({ length: digestMinRows() - 1 }, () => ({ blob: "x".repeat(2000) })) } };
    expect(digestToolResult(few)).toBe(few);
  });

  it("never digests an error", () => {
    const err = { error: "x".repeat(9000) };
    expect(digestToolResult(err)).toBe(err);
  });

  it("leaves a large NON-tabular payload alone rather than guessing at its shape", () => {
    const doc = { document: "x".repeat(9000) };
    expect(digestToolResult(doc)).toBe(doc);
  });

  it("tells the model to summarise rather than re-list", () => {
    const note = String((digestToolResult(payload()) as Record<string, unknown>).note);
    expect(note).toContain("KHÔNG chép lại từng dòng");
  });
});

describe("digestToolMessageContent", () => {
  // The real wire shape: the result arrives as { text: "<json>" }. The wrapper must survive so
  // the model sees the same shape it always has.
  it("digests inside the { text } wrapper and keeps the wrapper", () => {
    const wrapped = JSON.stringify({ text: JSON.stringify(payload()) });
    const out = digestToolMessageContent(wrapped);
    const parsed = JSON.parse(out) as { text: string };
    expect(typeof parsed.text).toBe("string");
    const inner = JSON.parse(parsed.text) as Record<string, unknown>;
    expect(inner._digest).toBe(true);
    expect(out.length).toBeLessThan(wrapped.length / 3);
  });

  it("leaves content that is not JSON exactly as it was", () => {
    const nudge = "Kết quả quá lớn nên đã RÚT GỌN — ".repeat(300);
    expect(digestToolMessageContent(nudge)).toBe(nudge);
  });

  it("leaves a small tool message alone", () => {
    const small = JSON.stringify({ ok: true });
    expect(digestToolMessageContent(small)).toBe(small);
  });
});

// The tool caps what it returns (max_rows=50) and reports the true size beside the array. If
// the digest drops that sibling, the model states the partial count as the answer — "there are
// 50 records" when there are 62. That is the same class of wrong number the panel's 50/62 note
// exists to prevent, so both must be told the same total.
describe("a capped result keeps its real total", () => {
  const capped = () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      refund_id: `REF-${i}`,
      refund_amount: 10 + i,
      pad: "padding to clear the size threshold ".repeat(6),
    }));
    return { status: "completed", results: { rows, row_count: 62 } };
  };

  it("reports the true total, and separately how many rows came back", () => {
    const out = digestToolResult(capped()) as Record<string, unknown>;
    expect(out.row_count).toBe(62);
    expect(out.rows_returned_by_tool).toBe(50);
  });

  it("warns the model in words not to quote the partial count as the total", () => {
    const note = String((digestToolResult(capped()) as Record<string, unknown>).note);
    expect(note).toContain("tổng thật là 62");
  });

  it("says nothing about a mismatch when there is none", () => {
    const whole = {
      status: "completed",
      results: {
        rows: Array.from({ length: 20 }, (_, i) => ({ a: i, pad: "x".repeat(400) })),
        row_count: 20,
      },
    };
    expect(String((digestToolResult(whole) as Record<string, unknown>).note)).not.toContain("tổng thật");
  });
});

// A note is a string built by concatenation, so a stray operator turns a whole sentence into
// "NaN" without failing any assertion that only checks the surviving fragments — which is
// exactly what happened: `+ +` swallowed the sentence telling the model the full table was
// already on screen, and three passing tests said nothing. Assert the note as a WHOLE.
describe("the note survives concatenation intact", () => {
  const notes = () => {
    const big = {
      status: "completed",
      results: {
        rows: Array.from({ length: 40 }, (_, i) => ({ a: i, pad: "x".repeat(300) })),
        row_count: 62,
      },
    };
    const whole = {
      status: "completed",
      results: {
        rows: Array.from({ length: 40 }, (_, i) => ({ a: i, pad: "x".repeat(300) })),
        row_count: 40,
      },
    };
    return [big, whole].map((p) => String((digestToolResult(p) as Record<string, unknown>).note));
  };

  it("never contains NaN or undefined", () => {
    for (const n of notes()) {
      expect(n).not.toContain("NaN");
      expect(n).not.toContain("undefined");
    }
  });

  it("keeps every instruction the model depends on", () => {
    for (const n of notes()) {
      expect(n).toContain("ĐANG NHÌN THẤY"); // why it may stop re-listing
      expect(n).toContain("aggregates"); // where the totals come from
      expect(n).toContain("KHÔNG chép lại từng dòng"); // the actual instruction
    }
  });
});

// Measured failure, Larvis, 2026-08-07: asked "show me the full table", the assistant answered
// "the tool only returned a sample of the data ... I can't show the full table" — a refusal of
// a request the database can satisfy, caused by this note telling it to re-query with a
// NARROWER filter when the user had asked for MORE. A capped result and a complete one need
// opposite advice, and the panel claim must match which one it is.
describe("capped and complete results get opposite advice", () => {
  const make = (returned: number, rowCount: number) => ({
    status: "completed",
    results: {
      rows: Array.from({ length: returned }, (_, i) => ({ a: i, pad: "x".repeat(300) })),
      row_count: rowCount,
    },
  });
  const noteOf = (returned: number, rowCount: number) =>
    String((digestToolResult(make(returned, rowCount)) as Record<string, unknown>).note);

  it("capped: says how to get the REST, and forbids claiming it cannot be shown", () => {
    const n = noteOf(50, 62);
    expect(n).toContain("giới hạn số dòng lớn hơn");
    expect(n).toContain("ĐỪNG trả lời rằng bạn không thể hiển thị");
    expect(n).not.toContain("lọc hẹp hơn");
  });

  // Claiming a partial panel is the full table is the lie this whole design exists to avoid.
  it("capped: describes the panel as partial, never as complete", () => {
    const n = noteOf(50, 62);
    expect(n).toContain("50/62");
    expect(n).not.toContain("bảng ĐẦY ĐỦ");
  });

  it("complete: says the panel IS the whole table", () => {
    const n = noteOf(40, 40);
    expect(n).toContain("bảng ĐẦY ĐỦ");
    expect(n).not.toContain("giới hạn số dòng lớn hơn");
  });
});

// The thresholds are env-tunable so a deployment can tune — or escape — without a code change.
// A typo must not silently disable the reduction, which is why an invalid value falls back to
// the default rather than being taken literally.
describe("thresholds come from env", () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
  });

  const big = () => ({
    status: "completed",
    results: {
      rows: Array.from({ length: 40 }, (_, i) => ({ a: i, pad: "x".repeat(300) })),
      row_count: 40,
    },
  });

  it("a very high DIGEST_MIN_CHARS turns the reduction off", () => {
    process.env.DIGEST_MIN_CHARS = "999999";
    const r = big();
    expect(digestToolResult(r)).toBe(r);
  });

  it("DIGEST_SAMPLE_ROWS controls how many rows the model gets", () => {
    process.env.DIGEST_SAMPLE_ROWS = "20";
    const out = digestToolResult(big()) as Record<string, unknown>;
    expect((out.sample as unknown[]).length).toBe(20);
  });

  it("DIGEST_MIN_ROWS keeps a short-but-long result whole", () => {
    process.env.DIGEST_MIN_ROWS = "100";
    const r = big();
    expect(digestToolResult(r)).toBe(r);
  });

  it("falls back to the default on a value that is not a positive number", () => {
    for (const bad of ["abc", "0", "-5", ""]) {
      process.env.DIGEST_MIN_CHARS = bad;
      expect((digestToolResult(big()) as Record<string, unknown>)._digest).toBe(true);
    }
  });
});
