import { describe, expect, test } from "vitest";
import { ALL_SCENARIOS } from "./index";

describe("ALL_SCENARIOS", () => {
  test("đúng 10 ca, id duy nhất", () => {
    expect(ALL_SCENARIOS).toHaveLength(10);
    expect(new Set(ALL_SCENARIOS.map((s) => s.id)).size).toBe(10);
  });
  test("mọi callsTool/notCalls dùng tên tool có tiền tố hợp lệ", () => {
    const KNOWN = /^(laam_|geo_|trello_)/;
    for (const s of ALL_SCENARIOS) {
      const names = [s.expect.callsTool ?? [], s.expect.notCalls ?? []].flat() as string[];
      for (const n of names) expect(n, `${s.id}:${n}`).toMatch(KNOWN);
    }
  });
  test("scenario write-intent có extraToolSchemas cho write-tool", () => {
    const w = ALL_SCENARIOS.find((s) => s.capability === "write-intent")!;
    expect(w.extraToolSchemas?.some((t) => t.function.name === "trello_create_card")).toBe(true);
  });
});
