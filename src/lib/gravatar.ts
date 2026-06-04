import { createHash } from "node:crypto";

// Gravatar URL from an email (md5 of the trimmed/lowercased address). `d=identicon`
// returns a generated avatar when the email has no Gravatar, so we always get an
// image without needing a stored avatar field. Server-only (uses node:crypto).
export function gravatarUrl(email: string | null | undefined, size = 96): string {
  const e = (email ?? "").trim().toLowerCase();
  const hash = createHash("md5").update(e).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}
