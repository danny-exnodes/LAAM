import { describe, expect, test } from "vitest";
import { encryptJson, decryptJson, encryptJsonForUser, decryptJsonForUser } from "./crypto";

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

// Per-user key derivation: each user's connector secrets are encrypted under a key derived
// HKDF(master, userId), not the single global key. This gives cross-user CRYPTOGRAPHIC
// isolation (a bug that hands user A's blob to user B's key fails closed) and the seam for
// future BYOK / per-user key material. It does NOT by itself defeat master-secret compromise —
// that requires per-user material (KMS/DPAPI), a documented follow-up.
describe("per-user HKDF crypto", () => {
  test("round-trips an object for a user", () => {
    const obj = { token: "ghp_user_a", _connectedAt: "2026-06-16T00:00:00Z" };
    const blob = encryptJsonForUser("user-a", obj);
    expect(blob).not.toContain("ghp_user_a"); // ciphertext, not plaintext
    expect(decryptJsonForUser("user-a", blob)).toEqual(obj);
  });

  test("per-user blob carries the v2 marker (distinguishable from legacy 3-part blobs)", () => {
    expect(encryptJsonForUser("user-a", { a: 1 }).startsWith("v2:")).toBe(true);
  });

  test("cross-user isolation: another user's key cannot decrypt the blob", () => {
    const blob = encryptJsonForUser("user-a", { secret: "x" });
    expect(() => decryptJsonForUser("user-b", blob)).toThrow();
  });

  test("same plaintext, two users → different ciphertext + no cross-decrypt", () => {
    const a = encryptJsonForUser("user-a", { v: "same" });
    const b = encryptJsonForUser("user-b", { v: "same" });
    expect(a).not.toBe(b);
    expect(() => decryptJsonForUser("user-a", b)).toThrow();
    expect(() => decryptJsonForUser("user-b", a)).toThrow();
  });

  test("lazy migration: a legacy global-key blob still decrypts for any user", () => {
    // Rows written before HKDF (3-part, global key) must remain readable — they re-encrypt to
    // v2 on the next write (setCreds), not eagerly. decryptJsonForUser routes legacy → global key.
    const legacy = encryptJson({ token: "old_global" });
    expect(decryptJsonForUser("any-user", legacy)).toEqual({ token: "old_global" });
  });

  test("rejects a tampered per-user blob (auth tag mismatch)", () => {
    const blob = encryptJsonForUser("user-a", { a: "1" });
    const parts = blob.split(":"); // [v2, iv, tag, ct]
    const ct = Buffer.from(parts[3], "base64");
    ct[0] ^= 0xff;
    parts[3] = ct.toString("base64");
    expect(() => decryptJsonForUser("user-a", parts.join(":"))).toThrow();
  });
});
