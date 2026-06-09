import { describe, expect, test } from "vitest";
import { assertRecipientAllowed, parseAllowlist } from "./recipient";

const allow = (l: string[]) => new Set(l.map((s) => s.toLowerCase()));

// The gate reads each tool's self-declared recipientField from the registry, parses the
// RESOLVED recipient via the shared parseRecipients, and requires EVERY recipient to match
// the operator allowlist (domain or full address). Fail-closed: empty allowlist or any
// non-matching/ non-canonical recipient throws. (spec 2026-06-09 §3.2.)
describe("assertRecipientAllowed — destination allowlist gate", () => {
  test("gmail_send recipient in allowed DOMAIN → pass", () => {
    expect(() => assertRecipientAllowed("gmail_send", { to: "boss@company.com" }, allow(["company.com"]))).not.toThrow();
  });

  test("gmail_send recipient matched by FULL ADDRESS → pass", () => {
    expect(() => assertRecipientAllowed("gmail_send", { to: "alerts@gmail.com" }, allow(["alerts@gmail.com"]))).not.toThrow();
  });

  test("recipient outside allowlist → throw", () => {
    expect(() => assertRecipientAllowed("gmail_send", { to: "evil@attacker.com" }, allow(["company.com"]))).toThrow(/allowlist/i);
  });

  test("empty allowlist → throw even for valid addr (fail-closed, G4)", () => {
    expect(() => assertRecipientAllowed("gmail_send", { to: "boss@company.com" }, allow([]))).toThrow();
  });

  test("multi-recipient, one outside → throw (G5 strict)", () => {
    expect(() => assertRecipientAllowed("gmail_send", { to: "boss@company.com, evil@x.com" }, allow(["company.com"]))).toThrow();
  });

  test("multi-recipient all allowed → pass", () => {
    expect(() => assertRecipientAllowed("gmail_send", { to: "a@company.com, b@company.com" }, allow(["company.com"]))).not.toThrow();
  });

  test("CRLF injection in `to` → throw (via shared parseRecipients)", () => {
    expect(() =>
      assertRecipientAllowed("gmail_send", { to: "boss@company.com\r\nBcc: evil@x.com" }, allow(["company.com"])),
    ).toThrow();
  });

  test("tool WITHOUT recipientField (demo_create_task) → no-op", () => {
    expect(() => assertRecipientAllowed("demo_create_task", { title: "x" }, allow([]))).not.toThrow();
  });

  test("unknown tool → no-op (no recipientField)", () => {
    expect(() => assertRecipientAllowed("nonexistent_tool", {}, allow([]))).not.toThrow();
  });
});

describe("parseAllowlist — operator env parse", () => {
  test("comma-separated → trimmed, lowercased set", () => {
    expect([...parseAllowlist("Company.com, alerts@Gmail.com ")].sort()).toEqual(["alerts@gmail.com", "company.com"]);
  });

  test("empty / blank → empty set (→ gate fail-closed)", () => {
    expect(parseAllowlist("").size).toBe(0);
    expect(parseAllowlist("   ").size).toBe(0);
  });
});
