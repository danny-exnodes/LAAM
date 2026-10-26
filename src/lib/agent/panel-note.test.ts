import { describe, it, expect } from "vitest";
import { annotatePanelShown } from "./panel-note";
import type { ViewDescriptor } from "./view";

const table = (rows: number, truncated?: { shown: number; total: number }): ViewDescriptor => ({
  kind: "table",
  title: "t",
  source: { type: "tool", toolName: "kg_query", at: 0 },
  rows: Array.from({ length: rows }, (_, i) => ({ a: i })),
  truncated,
});

// Measured 2026-08-07 in the demo UI, the receipt for TXN-0004917: the model typed out the
// six line items itself and printed a unit price of "$1022" for a value that is 10.22 — a
// hundredfold error on a receipt — while the code-built table right below it carried the
// correct number.
//
// The instruction that stops this ("the user is already looking at a table, do not copy it")
// existed, but only inside the digest, which runs at >=6000 chars AND >=10 rows. The panel
// itself shows from 3 rows. Everything between those two thresholds got a panel and no
// instruction, and most demo answers land in that gap.
describe("annotatePanelShown", () => {
  it("tells the model a table is already on screen", () => {
    const out = annotatePanelShown({ rows: [{ a: 1 }] }, table(6)) as Record<string, string>;
    expect(out.panel_note).toContain("6");
    expect(out.panel_note).toMatch(/đừng chép lại|KHÔNG chép lại/i);
  });

  it("keeps every original field — the rows still reach the model", () => {
    const result = { status: "completed", sql: "SELECT 1", rows: [{ a: 1 }] };
    const out = annotatePanelShown(result, table(6)) as Record<string, unknown>;
    expect(out.status).toBe("completed");
    expect(out.sql).toBe("SELECT 1");
    expect(out.rows).toEqual([{ a: 1 }]);
  });

  it("says the panel is partial when the view is truncated, so the count is not misread", () => {
    const out = annotatePanelShown({}, table(50, { shown: 50, total: 62 })) as Record<string, string>;
    expect(out.panel_note).toContain("62");
  });

  it("returns the result untouched when no panel was shown", () => {
    const result = { rows: [{ a: 1 }] };
    expect(annotatePanelShown(result, null)).toBe(result);
  });

  // The digest carries its own version of this instruction, for the case where the model was
  // given only a sample. Emitting both would put two different row counts in front of the
  // model — the digest's is the one computed over the full result, so it wins.
  it("does not add a second instruction to an already-digested result", () => {
    const digested = { _digest: true, note: "…đã có ghi chú digest…", sample: [] };
    expect(annotatePanelShown(digested, table(50))).toBe(digested);
  });

  it("leaves a non-object result alone rather than wrapping it", () => {
    expect(annotatePanelShown("plain text", table(6))).toBe("plain text");
  });
});
