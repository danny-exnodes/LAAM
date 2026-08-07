import { describe, it, expect } from "vitest";
import { repairTableDelimiters } from "./repair-tables";

// Measured 2026-08-07 in the demo UI, "Show every refund processed by Sarah Miller.":
// the model wrote a two-column header and a ONE-column delimiter row.
//
//   | Metric | Value |
//   |--------|
//   | Total number of refunds | 62 |
//
// GFM requires the delimiter row to have exactly as many cells as the header. It does not, so
// remark stops seeing a table and the whole block falls back to a paragraph — where newlines
// render as spaces, so eleven rows arrive as one run-on line of pipes on screen. Nothing is
// wrong with the renderer and nothing is lost in transport; the count is simply off by one.
//
// Fixed in code rather than by asking the model to type more carefully: cell counts are
// countable, and a malformed table is not a judgement call (AGENTS Rule 5).
describe("repairTableDelimiters", () => {
  it("widens a short delimiter row to the header's cell count", () => {
    const out = repairTableDelimiters("| Metric | Value |\n|--------|\n| Rows | 62 |");
    expect(out).toBe("| Metric | Value |\n| --- | --- |\n| Rows | 62 |");
  });

  it("narrows a delimiter row that has too many cells", () => {
    const out = repairTableDelimiters("| A | B |\n| --- | --- | --- |\n| 1 | 2 |");
    expect(out).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });

  it("keeps the alignment the model did write", () => {
    const out = repairTableDelimiters("| A | B | C |\n|:---|---:|\n| 1 | 2 | 3 |");
    expect(out).toBe("| A | B | C |\n| :--- | ---: | --- |\n| 1 | 2 | 3 |");
  });

  it("leaves a well-formed table byte-identical", () => {
    const src = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(repairTableDelimiters(src)).toBe(src);
  });

  it("leaves a single-column table alone", () => {
    const src = "| Metric |\n|---|\n| 62 |";
    expect(repairTableDelimiters(src)).toBe(src);
  });

  // A setext H2 is a run of dashes under text. If that text happens to contain a pipe, a
  // careless repair would turn the heading into a table delimiter and eat the heading.
  it("does not touch a dashed line that has no pipe", () => {
    const src = "Sales | Refunds\n---\nnext paragraph";
    expect(repairTableDelimiters(src)).toBe(src);
  });

  it("does not rewrite anything inside a fenced code block", () => {
    const src = "```\n| A | B |\n|---|\n```";
    expect(repairTableDelimiters(src)).toBe(src);
  });

  it("repairs every table in a message, not just the first", () => {
    const out = repairTableDelimiters("| A | B |\n|---|\n| 1 | 2 |\n\n| C | D |\n|---|\n| 3 | 4 |");
    expect(out.split("| --- | --- |")).toHaveLength(3);
  });

  it("returns text with no table untouched", () => {
    const src = "Just a sentence with a | pipe in it.";
    expect(repairTableDelimiters(src)).toBe(src);
  });
});
