import { describe, it, expect } from "vitest";
import { filterKinds, fold } from "./nodeSearch";
import type { WfNodeKind } from "@/lib/workflow/types";

const KINDS: WfNodeKind[] = ["agent", "connector", "mcp", "condition", "foreach"];

// Stand-in localized labels (vi) — the real caller injects t()-resolved strings.
const labels: Record<WfNodeKind, string> = {
  agent: "Agent — gọi mô hình",
  connector: "Connector — gọi công cụ",
  mcp: "MCP — gọi server",
  condition: "Điều kiện — rẽ nhánh true/false",
  foreach: "Lặp — chạy body mỗi phần tử",
};
const labelOf = (k: WfNodeKind) => labels[k];

describe("filterKinds", () => {
  it("returns all kinds (in order) for an empty/whitespace query", () => {
    expect(filterKinds("", KINDS, labelOf)).toEqual(KINDS);
    expect(filterKinds("   ", KINDS, labelOf)).toEqual(KINDS);
  });

  it("matches a plain substring of the localized label", () => {
    expect(filterKinds("server", KINDS, labelOf)).toEqual(["mcp"]);
  });

  it("matches diacritic-folded: an unaccented query finds an accented label", () => {
    // WHY: Vietnamese operators type without accents; "dieu kien" must find
    // "Điều kiện" or the palette is useless on a Vietnamese keyboard.
    expect(filterKinds("dieu kien", KINDS, labelOf)).toEqual(["condition"]);
  });

  it("requires ALL terms to match (AND semantics)", () => {
    expect(filterKinds("goi cong cu", KINDS, labelOf)).toEqual(["connector"]);
    expect(filterKinds("goi xyz", KINDS, labelOf)).toEqual([]);
  });

  it("returns [] when nothing matches", () => {
    expect(filterKinds("zzz", KINDS, labelOf)).toEqual([]);
  });

  it("fold() strips Vietnamese diacritics and đ", () => {
    expect(fold("Điều Kiện")).toBe("dieu kien");
  });
});
