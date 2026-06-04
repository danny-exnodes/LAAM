// Machine tokens authenticate a remote collector to POST /api/ingest.
// The raw token is shown to the admin ONCE; only its sha256 hash is stored.
import { randomBytes, createHash } from "node:crypto";

export function generateMachineToken(): string {
  return "laam_" + randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
