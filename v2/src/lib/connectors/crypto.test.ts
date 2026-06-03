import { describe, expect, test } from "vitest";
import { encryptJson, decryptJson } from "./crypto";

describe("connector crypto", () => {
  test("round-trips an object", () => {
    const obj = { token: "ghp_secret123", _connectedAt: "2026-06-03T00:00:00Z" };
    const blob = encryptJson(obj);
    expect(typeof blob).toBe("string");
    expect(blob).not.toContain("ghp_secret123"); // ciphertext, not plaintext
    expect(decryptJson(blob)).toEqual(obj);
  });

  test("produces a different blob each call (random IV)", () => {
    const obj = { a: "1" };
    expect(encryptJson(obj)).not.toBe(encryptJson(obj));
  });

  test("rejects a tampered blob (auth tag mismatch)", () => {
    const blob = encryptJson({ a: "1" });
    const parts = blob.split(":");
    // flip a byte in the ciphertext segment
    const ct = Buffer.from(parts[2], "base64");
    ct[0] ^= 0xff;
    parts[2] = ct.toString("base64");
    expect(() => decryptJson(parts.join(":"))).toThrow();
  });

  test("rejects a malformed blob", () => {
    expect(() => decryptJson("not-a-blob")).toThrow();
  });
});
