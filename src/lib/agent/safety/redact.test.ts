import { describe, expect, test } from "vitest";
import { redact, redactString } from "./redact";

describe("redactString", () => {
  test("scrub Trello key+token trong query string (rủi ro trello.ts:15)", () => {
    const s = "https://api.trello.com/1/cards?key=abcd1234&token=secretTok99";
    const r = redactString(s);
    expect(r).not.toContain("abcd1234");
    expect(r).not.toContain("secretTok99");
    expect(r).toContain("key=‹redacted›");
    expect(r).toContain("token=‹redacted›");
  });
  test("scrub Bearer token", () => {
    expect(redactString("Authorization: Bearer ey.Jh.zzz")).toBe("Authorization: Bearer ‹redacted›");
  });
  test("scrub GitHub PAT", () => {
    expect(redactString("dùng ghp_0123456789abcdefghijABCDEF nhé")).toContain("‹redacted›");
  });
  test("giữ nguyên text thường", () => {
    expect(redactString('tạo card "Mua sữa"')).toBe('tạo card "Mua sữa"');
  });
});

describe("redact (deep)", () => {
  test("redact string lồng trong object/array, giữ số", () => {
    const v = { url: "x?token=abc123def456", items: ["Bearer zzzxxxccc"], n: 5 };
    const r = redact(v);
    expect(r.url).toContain("‹redacted›");
    expect(r.items[0]).toContain("‹redacted›");
    expect(r.n).toBe(5);
  });
  test("không mutate input", () => {
    const v = { a: "key=secret123456" };
    redact(v);
    expect(v.a).toBe("key=secret123456");
  });
});
