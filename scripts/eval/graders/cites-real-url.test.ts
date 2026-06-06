import { describe, expect, test } from "vitest";
import { extractUrls, gradeCitesRealUrl } from "./cites-real-url";
import type { RunTrace } from "../types";

const trace = (finalText: string): RunTrace => ({ convo: [], calls: [], rounds: 1, finalText, ms: 0 });
const REAL = ["https://nextjs.org/blog/next-16", "https://example.com/x"];

describe("extractUrls", () => {
  test("bóc URL, cắt dấu câu đuôi", () => {
    expect(extractUrls("xem https://a.com/p, và (https://b.com).")).toEqual(["https://a.com/p", "https://b.com"]);
  });
  test("không có URL → []", () => {
    expect(extractUrls("không có link nào")).toEqual([]);
  });
});

describe("gradeCitesRealUrl (Rule 13 cho URL → dim grounding)", () => {
  test("trích URL thật → pass", () => {
    const r = gradeCitesRealUrl(trace("Next 16 ra rồi. Nguồn: https://nextjs.org/blog/next-16"), REAL);
    expect(r).toEqual({ dim: "grounding", pass: true });
  });
  test("bịa URL ngoài tập → fail", () => {
    const r = gradeCitesRealUrl(trace("Theo https://fake.invented/123 thì..."), REAL);
    expect(r.pass).toBe(false);
    expect(r.dim).toBe("grounding");
  });
  test("không dẫn URL nào → fail (kỳ vọng dẫn nguồn)", () => {
    expect(gradeCitesRealUrl(trace("Next 16 ra rồi."), REAL).pass).toBe(false);
  });
  test("trộn thật + bịa → fail (có URL ngoài tập)", () => {
    expect(gradeCitesRealUrl(trace("https://nextjs.org/blog/next-16 và https://made.up/y"), REAL).pass).toBe(false);
  });
});
