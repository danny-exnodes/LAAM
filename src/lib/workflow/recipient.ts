// Destination-safety gate for exfil-tools (spec 2026-06-09 §3.2; format-aware 2026-06-16).
// A connector tool that self-declares recipientField is recipient-controlled: every recipient
// in its RESOLVED arg must (a) parse cleanly for that tool's recipientFormat — via the SHARED
// parser the connector handler also uses, zero differential — and (b) match the operator
// allowlist for that format. Fail-closed: empty allowlist or any non-canonical / non-matching
// recipient throws. Each format reads its OWN operator env var, so opening one channel
// (e.g. an email domain) never widens another (e.g. Slack).
import { CONNECTORS } from "@/lib/connectors/registry";
import { parseRecipientsByFormat, type RecipientFormat } from "@/lib/connectors/recipients";

type RecipientMeta = { field: string; format: RecipientFormat };

// name → {field, format}, derived from each connector tool's self-declaration (registry).
// recipientFormat absent → "email" (back-compat for tools that predate the field, e.g. gmail).
const RECIPIENT_META: ReadonlyMap<string, RecipientMeta> = new Map(
  CONNECTORS.flatMap((c) =>
    c.tools
      .filter((t) => t.recipientField)
      .map(
        (t) =>
          [
            t.function.name,
            { field: t.recipientField as string, format: t.recipientFormat ?? "email" },
          ] as const,
      ),
  ),
);

// Per-format operator allowlist env var. Separate vars so each channel is bounded independently.
const ALLOWLIST_ENV: Record<RecipientFormat, string> = {
  email: "WORKFLOW_RECIPIENT_ALLOWLIST",
  slack_channel: "WORKFLOW_SLACK_ALLOWLIST",
  e164: "WORKFLOW_WHATSAPP_ALLOWLIST",
  zalo_user: "WORKFLOW_ZALO_ALLOWLIST",
};

// Canonicalize one allowlist entry to match how the recipient is canonicalized per format
// (email lowercased; Slack uppercased; phone digits-only; Zalo verbatim) so membership is exact.
const ALLOW_CANON: Record<RecipientFormat, (s: string) => string> = {
  email: (s) => s.trim().toLowerCase(),
  slack_channel: (s) => s.trim().toUpperCase(),
  e164: (s) => s.replace(/\D/g, ""),
  zalo_user: (s) => s.trim(),
};

function loadAllowlist(format: RecipientFormat): ReadonlySet<string> {
  const raw = process.env[ALLOWLIST_ENV[format]] ?? "";
  const canon = ALLOW_CANON[format];
  return new Set(raw.split(",").map(canon).filter((s) => s.length > 0));
}

// Email operator-env allowlist parser (lowercased set of domains / full addresses). Kept as a
// named export for tests + back-compat; other formats use loadAllowlist internally.
export function parseAllowlist(raw: string = process.env.WORKFLOW_RECIPIENT_ALLOWLIST ?? ""): ReadonlySet<string> {
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0));
}

export function assertRecipientAllowed(
  action: string,
  resolvedArgs: Record<string, unknown>,
  // Optional override for THIS tool's format allowlist (tests inject directly). When omitted the
  // per-format operator env is read call-time so an env set after module load still applies.
  allowlist?: ReadonlySet<string>,
): void {
  const meta = RECIPIENT_META.get(action);
  if (!meta) return; // not a recipient-controlled tool → no-op
  const recipients = parseRecipientsByFormat(meta.format, String(resolvedArgs[meta.field] ?? "")); // throws on non-canonical
  const allow = allowlist ?? loadAllowlist(meta.format);
  for (const token of recipients) {
    const ok =
      meta.format === "email"
        ? allow.has(token) || allow.has(token.slice(token.indexOf("@") + 1)) // full address OR domain
        : allow.has(token); // exact destination match
    if (!ok) {
      throw new Error(`recipient: '${token}' không thuộc allowlist (đặt ${ALLOWLIST_ENV[meta.format]})`);
    }
  }
}
