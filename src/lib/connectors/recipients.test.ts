import { describe, expect, test } from "vitest";
import { parseRecipients, parseRecipientsByFormat } from "./recipients";

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

// parseRecipientsByFormat dispatches per recipient FORMAT so the workflow gate can validate
// non-email destinations (Slack channel-id, WhatsApp E.164 phone, Zalo OA user-id). Each
// branch is security-critical: it must reject injection / whitespace / multi-target smuggling
// and return the destination in the SAME canonical form the connector handler actually sends
// (zero gate↔handler differential).
describe("parseRecipientsByFormat — per-format destination parser", () => {
  test("email format delegates to parseRecipients (comma list, lowercased)", () => {
    expect(parseRecipientsByFormat("email", "A@X.com, b@y.com")).toEqual(["a@x.com", "b@y.com"]);
    expect(() => parseRecipientsByFormat("email", "boss@company.com\r\nBcc: evil@x.com")).toThrow();
  });

  describe("slack_channel — uppercase channel ID, single target", () => {
    test("valid C-id → [id] unchanged", () => {
      expect(parseRecipientsByFormat("slack_channel", "C01234ABCD")).toEqual(["C01234ABCD"]);
    });
    test("lowercase rejected (Slack IDs are uppercase; case-differential)", () => {
      expect(() => parseRecipientsByFormat("slack_channel", "c01234abcd")).toThrow();
    });
    test("comma (multi-target smuggle) rejected — NOT split like email", () => {
      expect(() => parseRecipientsByFormat("slack_channel", "C01234ABCD,C09999ZZZZ")).toThrow();
    });
    test("surrounding/internal whitespace rejected (handler sends raw → no differential)", () => {
      expect(() => parseRecipientsByFormat("slack_channel", " C01234ABCD ")).toThrow();
      expect(() => parseRecipientsByFormat("slack_channel", "C0123 4ABCD")).toThrow();
    });
    test("empty / too-short rejected", () => {
      expect(() => parseRecipientsByFormat("slack_channel", "")).toThrow();
      expect(() => parseRecipientsByFormat("slack_channel", "C12")).toThrow();
    });
  });

  describe("e164 — WhatsApp phone, digits-only (matches handler strip)", () => {
    test("plain digits → [digits]", () => {
      expect(parseRecipientsByFormat("e164", "84912345678")).toEqual(["84912345678"]);
    });
    test("strips +, spaces — zero-differential with handler replace(/\\D/g)", () => {
      expect(parseRecipientsByFormat("e164", "+84 912 345 678")).toEqual(["84912345678"]);
    });
    test("too short (<7) / too long (>15) rejected", () => {
      expect(() => parseRecipientsByFormat("e164", "12345")).toThrow();
      expect(() => parseRecipientsByFormat("e164", "1234567890123456")).toThrow();
    });
    test("no digits → reject", () => {
      expect(() => parseRecipientsByFormat("e164", "not-a-phone")).toThrow();
      expect(() => parseRecipientsByFormat("e164", "")).toThrow();
    });
  });

  describe("zalo_user — OA user-id, single token, no transform", () => {
    test("numeric id → [id]", () => {
      expect(parseRecipientsByFormat("zalo_user", "2367895144017812345")).toEqual(["2367895144017812345"]);
    });
    test("whitespace / comma / structural chars rejected", () => {
      expect(() => parseRecipientsByFormat("zalo_user", "u 42")).toThrow();
      expect(() => parseRecipientsByFormat("zalo_user", "u1,u2")).toThrow();
      expect(() => parseRecipientsByFormat("zalo_user", "u42\r\nx")).toThrow();
      expect(() => parseRecipientsByFormat("zalo_user", "")).toThrow();
    });
  });
});
