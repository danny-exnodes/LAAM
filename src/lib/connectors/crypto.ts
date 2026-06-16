// AES-256-GCM credential encryption for connector secrets.
//
// Two key schemes share this file:
//   - GLOBAL key (legacy + still used for transient, non-per-user blobs: OAuth state cookies,
//     SP-2 write-token sealing). Blob format: "iv:tag:ct" (3 base64 parts). The 32-byte key is
//     sha256(CONNECTOR_KEY ?? AUTH_SECRET ?? dev-fallback).
//   - PER-USER key, derived HKDF(master, userId), for stored credentials (connectors/store.ts +
//     mcp/store.ts). Blob format: "v2:iv:tag:ct" (4 parts, "v2" marker). This gives cross-user
//     CRYPTOGRAPHIC isolation — a blob encrypted for user A cannot be decrypted with user B's key
//     (a query/code bug that crosses them fails closed) — and the seam for future BYOK.
//
// SECURITY NOTE (honest scope): per-user HKDF derives every user's key from the SAME master
// secret, so a leak of that env still allows deriving all keys. It does NOT defeat master-secret
// compromise; that needs per-user key material (KMS/DPAPI/BYOK) — a documented follow-up. What
// it buys today: isolation, a versioned migration path, and the BYOK derivation seam.
//
// Production MUST set CONNECTOR_KEY (or AUTH_SECRET). Legacy global-key blobs remain readable and
// are re-encrypted to the per-user scheme lazily, on the next write (setCreds), never eagerly.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

const DEV_FALLBACK = "laam-connector-dev-key-do-not-use-in-prod";
const V2 = "v2"; // per-user blob marker
// Fixed, non-secret HKDF salt — domain-separates LAAM's derivation from any other use of the
// same master secret. (HKDF salt need not be secret; the security comes from the master IKM.)
const HKDF_SALT = Buffer.from("laam-connector-hkdf-v2");

function masterSecret(): string {
  return process.env.CONNECTOR_KEY ?? process.env.AUTH_SECRET ?? DEV_FALLBACK;
}

// Global 32-byte key (legacy scheme). sha256 → exactly 32 bytes regardless of source length.
function globalKey(): Buffer {
  return createHash("sha256").update(masterSecret(), "utf8").digest();
}

// Per-user 32-byte AES key, HKDF-SHA256 bound to userId via the `info` parameter so each user's
// key is distinct and a cross-user blob can never authenticate.
function userKey(userId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(masterSecret(), "utf8"), HKDF_SALT, `laam-connector:${userId}`, 32));
}

function aesEncrypt(key: Buffer, obj: unknown): { iv: string; tag: string; ct: string } {
  const iv = randomBytes(12); // 96-bit nonce, recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), "utf8")), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

function aesDecrypt<T>(key: Buffer, ivB64: string, tagB64: string, ctB64: string): T {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}

// --- Global scheme (transient/non-per-user blobs; format + behaviour UNCHANGED) ---

export function encryptJson(obj: unknown): string {
  const { iv, tag, ct } = aesEncrypt(globalKey(), obj);
  return [iv, tag, ct].join(":");
}

export function decryptJson<T = Record<string, string>>(blob: string): T {
  const parts = String(blob).split(":");
  if (parts.length !== 3) throw new Error("invalid connector secret blob");
  return aesDecrypt<T>(globalKey(), parts[0], parts[1], parts[2]);
}

// --- Per-user scheme (stored credentials) ---

export function encryptJsonForUser(userId: string, obj: unknown): string {
  const { iv, tag, ct } = aesEncrypt(userKey(userId), obj);
  return [V2, iv, tag, ct].join(":");
}

// Decrypt a stored-credential blob: v2 (4 parts) → per-user HKDF key; legacy (3 parts) → global
// key (lazy migration — old rows stay readable). Throws on tamper / wrong user / malformed input.
export function decryptJsonForUser<T = Record<string, string>>(userId: string, blob: string): T {
  const parts = String(blob).split(":");
  if (parts[0] === V2 && parts.length === 4) {
    return aesDecrypt<T>(userKey(userId), parts[1], parts[2], parts[3]);
  }
  if (parts.length === 3) {
    return aesDecrypt<T>(globalKey(), parts[0], parts[1], parts[2]); // legacy global-key blob
  }
  throw new Error("invalid connector secret blob");
}
