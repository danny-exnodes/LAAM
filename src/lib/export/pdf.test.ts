import { describe, it, expect } from "vitest";
import { makePdfBlob } from "./pdf";

describe("makePdfBlob", () => {
  it("produces a non-empty PDF Blob", () => {
    const blob = makePdfBlob("Báo cáo", "Dòng nội dung.");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("handles a long body that wraps across the page", () => {
    const long = "word ".repeat(2000);
    const blob = makePdfBlob("Title", long);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("handles empty title and body", () => {
    expect(makePdfBlob("", "").size).toBeGreaterThan(0);
  });
});
