import { expect, test } from "vitest";
import { searchDict } from "./search";
import { resolve } from "../index";

// Same parity contract as auth.test.ts: every key MUST ship all three languages
// so a non-vi user never sees a raw key on the Search page.
test("search has the expected key count (12) and a non-empty vi/en/zh for every key", () => {
  const keys = Object.keys(searchDict);
  expect(keys.length).toBe(12);
  for (const k of keys) {
    expect(searchDict[k].vi, `${k}.vi`).toBeTruthy();
    expect(searchDict[k].en, `${k}.en`).toBeTruthy();
    expect(searchDict[k].zh, `${k}.zh`).toBeTruthy();
  }
});

test("sample search strings resolve per language", () => {
  expect(resolve(searchDict, "vi", "search.title")).toBe("Tìm kiếm");
  expect(resolve(searchDict, "en", "search.group.sessions")).toBe("Agent sessions");
  expect(resolve(searchDict, "zh", "search.loading")).toBe("搜索中…");
});

test("empty-state interpolates the query in every language", () => {
  // {q} must survive translation — losing the placeholder breaks the empty state.
  for (const lang of ["vi", "en", "zh"] as const) {
    expect(resolve(searchDict, lang, "search.empty", { q: "laam" })).toContain("laam");
  }
});
