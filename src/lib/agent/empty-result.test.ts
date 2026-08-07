import { describe, it, expect } from "vitest";
import { foundNothing, annotateEmptyResult, queryTextFromArgs } from "./empty-result";

// WHY these tests exist (Rule 9): the business rule is "an empty result must never be
// reportable as absence". Each case below is a shape that really occurred, or a shape that
// would make the guard dangerous if it fired on it.
describe("foundNothing", () => {
  it("recognises the async query shape that produced the fraud false negative", () => {
    // Real payload from kg_query_datasource_status when the model asked for duplicate
    // refunds keyed on the primary key — empty by construction, answered "there are none".
    const result = { status: "completed", results: { columns: ["refund_id"], rows: [], row_count: 0 } };
    expect(foundNothing(result)).toBe(true);
  });

  it("recognises a bare empty array", () => {
    expect(foundNothing([])).toBe(true);
  });

  it("does NOT fire when rows came back", () => {
    expect(foundNothing({ results: { rows: [{ a: 1 }], row_count: 1 } })).toBe(false);
    expect(foundNothing([{ a: 1 }])).toBe(false);
  });

  // An error must keep its own reporting path. Calling a failure "found nothing" would
  // manufacture the exact confusion this module prevents.
  it("does NOT treat an error as an empty result", () => {
    expect(foundNothing({ error: "connection refused", rows: [] })).toBe(false);
  });

  // Conservative by design: an unfamiliar connector is left alone rather than annotated on
  // a guess, because a wrong note is itself misinformation.
  it("does NOT fire on an unrecognised shape", () => {
    expect(foundNothing({ summary: "nothing to report" })).toBe(false);
    expect(foundNothing("no results")).toBe(false);
    expect(foundNothing(null)).toBe(false);
  });

  it("reads a zero count even when the rows are absent (paged/truncated result)", () => {
    expect(foundNothing({ row_count: 0 })).toBe(true);
    expect(foundNothing({ total: 0 })).toBe(true);
  });
});

describe("queryTextFromArgs", () => {
  it("pulls the natural-language question so the note can quote it", () => {
    expect(queryTextFromArgs({ natural_language_query: "Show duplicate refunds across stores." }))
      .toBe("Show duplicate refunds across stores.");
  });

  it("accepts args that arrive as a JSON string", () => {
    expect(queryTextFromArgs('{"query":"which products have negative inventory?"}'))
      .toBe("which products have negative inventory?");
  });

  it("returns undefined rather than guessing when no question field is present", () => {
    expect(queryTextFromArgs({ data_source_id: "abc" })).toBeUndefined();
    expect(queryTextFromArgs("not json")).toBeUndefined();
  });
});

describe("annotateEmptyResult", () => {
  it("tells the model emptiness is not absence, and quotes what was actually asked", () => {
    const out = annotateEmptyResult(
      { status: "completed", results: { rows: [], row_count: 0 } },
      { natural_language_query: "refunds where the same refund_id appears in multiple stores" },
    ) as Record<string, unknown>;
    const note = String(out.note);
    // The two claims that must survive any future rewording of the note.
    expect(note).toContain("KHÔNG phải bằng chứng");
    expect(note).toContain("refund_id appears in multiple stores");
  });

  it("leaves a non-empty result byte-identical", () => {
    const result = { results: { rows: [{ a: 1 }], row_count: 1 } };
    expect(annotateEmptyResult(result, {})).toBe(result);
  });

  it("preserves the original fields so nothing downstream loses data", () => {
    const out = annotateEmptyResult({ status: "completed", sql: "SELECT 1", results: { rows: [] } }, {}) as Record<
      string,
      unknown
    >;
    expect(out.status).toBe("completed");
    expect(out.sql).toBe("SELECT 1");
  });
});

// Measured 2026-08-07 (sweep run B, Q4 "Show duplicate refunds across stores"): the note
// above WORKED as far as it went — the answer did open by naming the reading it had tested
// ("cùng số tiền, cùng thời gian và cùng khách hàng") — and then appended one more sentence,
// "Vì vậy không có duplicate refunds trong hệ thống hiện tại", which is the false all-clear
// the whole module exists to prevent. Disclosing the scope and then dropping it in the
// conclusion has to be named explicitly, because a general ban on "khẳng định chung chung"
// did not stop it.
//
// The second half is the part with measured leverage. In the SAME sweep, the user's own
// wording, "list duplicate refunds across stores", reached DAAB unchanged once and returned
// 8 rows — while every self-authored definition returned 0 or 2. So when the text that came
// back empty is NOT the user's, retrying with the user's words is not a suggestion.
describe("annotateEmptyResult when the model rewrote the question", () => {
  const empty = { status: "completed", results: { row_count: 0, rows: [] } };
  const noteOf = (args: unknown, userQuestion?: string) =>
    (annotateEmptyResult(empty, args, userQuestion) as Record<string, string>).note;

  it("requires re-asking in the user's own words before concluding", () => {
    const note = noteOf(
      { natural_language_query: "refunds with the same refund_amount, refund_datetime and customer_id" },
      "Show duplicate refunds across stores.",
    );
    expect(note).toContain("Show duplicate refunds across stores.");
    expect(note).toMatch(/BẮT BUỘC/);
  });

  it("does NOT demand a retry once the user's own words are what came back empty", () => {
    // Otherwise the retry never terminates: the same call would be asked for again forever.
    const q = "Show duplicate refunds across stores.";
    const note = noteOf({ natural_language_query: q }, q);
    expect(note).not.toMatch(/BẮT BUỘC/);
  });

  it("ignores casing, spacing and trailing punctuation when comparing the two", () => {
    const note = noteOf(
      { natural_language_query: "show   duplicate refunds across stores" },
      "Show duplicate refunds across stores.",
    );
    expect(note).not.toMatch(/BẮT BUỘC/);
  });

  it("names the trailing-conclusion shape that actually got past the old note", () => {
    const note = noteOf({ natural_language_query: "anything" }, "Show duplicate refunds across stores.");
    expect(note).toMatch(/Vì vậy|Do đó/);
  });
});
