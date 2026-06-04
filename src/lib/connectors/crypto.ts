// AES-256-GCM credential encryption for connector secrets.
// The encrypted blob is "iv:authTag:ciphertext" (each base64). The 32-byte key
// is derived (sha256) from CONNECTOR_KEY (preferred), else AUTH_SECRET, else a
// documented dev-only fallback — production MUST set one of those env vars.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const DEV_FALLBACK = "laam-connector-dev-key-do-not-use-in-prod";

function key(): Buffer {
  const src = process.env.CONNECTOR_KEY ?? process.env.AUTH_SECRET ?? DEV_FALLBACK;
  // sha256 -> exactly 32 bytes, regardless of source length.
  return createHash("sha256").update(src, "utf8").digest();
}

export function encryptJson(obj: unknown): string {
  const iv = randomBytes(12); // 96-bit nonce, recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptJson<T = Record<string, string>>(blob: string): T {
  const parts = String(blob).split(":");
  if (parts.length !== 3) throw new Error("invalid connector secret blob");
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
