import { describe, expect, test } from "vitest";
import { parseRecipients } from "./recipients";

// parseRecipients is the SHARED canonical parser (gate + gmail handler use the SAME
// function → gate-seen recipients == Gmail-sent recipients, no differential). It is
// security-critical: it MUST reject anything that isn't a bare local@domain so an
// attacker cannot smuggle a header (CRLF) or a hidden recipient (display-name/comment).
describe("parseRecipients — canonical bare-address parser (anti header-injection)", () => {
  test("single bare address → [addr], lowercased", () => {
    expect(parseRecipients("Alerts@Company.COM")).toEqual(["alerts@company.com"]);
  });

  test("comma-separated → list, trimmed", () => {
    expect(parseRecipients("a@x.com,  b@y.com")).toEqual(["a@x.com", "b@y.com"]);
  });

  test("local-part with + . - _ allowed (real addresses)", () => {
    expect(parseRecipients("first.last+wf_1@sub.company.com")).toEqual(["first.last+wf_1@sub.company.com"]);
  });

  test("trailing/empty comma tokens are dropped (not injection)", () => {
    expect(parseRecipients("a@x.com,")).toEqual(["a@x.com"]);
  });

  // --- fail-closed: the security cases the CTO will code-verify ---
  test("CRLF header-injection → throw", () => {
    expect(() => parseRecipients("ok@company.com\r\nBcc: evil@x.com")).toThrow();
    expect(() => parseRecipients("ok@company.com\nBcc: evil@x.com")).toThrow();
  });

  test("display-name with angle brackets → throw", () => {
    expect(() => parseRecipients('"Smith, John" <a@x.com>')).toThrow();
    expect(() => parseRecipients("John <a@x.com>")).toThrow();
  });

  test("RFC comment → throw", () => {
    expect(() => parseRecipients("a@x.com (sneaky)")).toThrow();
  });

  test("multiple @ in one token → throw", () => {
    expect(() => parseRecipients("a@b@x.com")).toThrow();
  });

  test("missing @ → throw", () => {
    expect(() => parseRecipients("notanemail")).toThrow();
  });

  test("domain without a dot (bare host) → throw", () => {
    expect(() => parseRecipients("a@localhost")).toThrow();
  });

  test("internal whitespace → throw", () => {
    expect(() => parseRecipients("a b@x.com")).toThrow();
    expect(() => parseRecipients("a@x .com")).toThrow();
  });

  test("empty / whitespace-only → throw (no valid recipient)", () => {
    expect(() => parseRecipients("")).toThrow();
    expect(() => parseRecipients("   ")).toThrow();
    expect(() => parseRecipients(",")).toThrow();
  });

  test("one bad among good → throw (no partial accept)", () => {
    expect(() => parseRecipients("good@x.com, evil@x.com\r\nBcc: z@y.com")).toThrow();
  });
});
