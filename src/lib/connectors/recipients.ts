// Canonical bare-address parser SHARED by the workflow recipient-gate and the gmail
// handler — so the addresses the gate validates are EXACTLY the addresses Gmail sends
// (zero parser-differential). PURE module (no imports) so both connectors/ and workflow/
// can use it without a circular dependency. Security-critical: rejects anything that is
// not a bare local@domain, blocking CRLF header-injection and hidden recipients
// (display-name, RFC comment, multiple-@). (spec 2026-06-09 §3.2 — F2.)

// Strict local@domain. The negated class excludes whitespace (\s covers CR/LF/tab/space),
// @, angle brackets, parens, comma and quote — every structural/injection char. The domain
// must contain at least one dot (rejects bare hosts like "localhost"). Anchored ^…$ so a
// CRLF cannot ride along after a valid-looking prefix.
const BARE_ADDR = /^[^\s@<>(),"]+@[^\s@<>(),"]+\.[^\s@<>(),"]+$/;

export function parseRecipients(raw: string): string[] {
  const tokens = raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new Error("recipient: không có địa chỉ hợp lệ");
  }
  for (const t of tokens) {
    if (!BARE_ADDR.test(t)) {
      throw new Error(`recipient: địa chỉ không hợp lệ/không an toàn "${t}" — chỉ chấp local@domain trần`);
    }
  }
  return tokens;
}

// Recipient-destination formats a connector tool can self-declare via `recipientFormat`.
// Each maps to a strict parser below + an operator allowlist env (see workflow/recipient.ts).
export type RecipientFormat = "email" | "slack_channel" | "e164" | "zalo_user";

// Slack channel/conversation ID: uppercase alphanumeric, no separators (anti multi-target /
// injection). Lowercase rejected — real Slack IDs are uppercase and the handler sends the raw
// value, so accepting lowercase would create a gate↔Slack differential.
const SLACK_ID = /^[A-Z0-9]{6,}$/;
// E.164 national+country digits, 7–15 (the upper bound also caps two-number concatenation).
const E164_DIGITS = /^\d{7,15}$/;
// Zalo OA user-id: a single opaque identifier token (real ones are long numerics). Allow
// alphanumerics plus _ and - only — no whitespace/comma/structural chars.
const ZALO_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Validate + canonicalize ONE outbound destination for `format`, returning the recipient(s) in
// the EXACT form the connector handler will send (so the gate validates what is actually sent).
// `email` keeps its comma-list semantics; the messenger formats are single-target (a comma is a
// smuggling attempt, not a separator). Throws on anything non-canonical → fail-closed.
export function parseRecipientsByFormat(format: RecipientFormat, raw: string): string[] {
  switch (format) {
    case "email":
      return parseRecipients(raw);
    case "slack_channel":
      if (!SLACK_ID.test(raw)) {
        throw new Error(`recipient: kênh Slack không hợp lệ "${raw}" — cần ID kênh dạng C… (chữ HOA + số, một kênh)`);
      }
      return [raw];
    case "e164": {
      // Mirror the WhatsApp handler exactly: strip every non-digit, then validate.
      const digits = raw.replace(/\D/g, "");
      if (!E164_DIGITS.test(digits)) {
        throw new Error(`recipient: số WhatsApp không hợp lệ "${raw}" — cần 7–15 chữ số (E.164, không dấu +)`);
      }
      return [digits];
    }
    case "zalo_user":
      if (!ZALO_ID.test(raw)) {
        throw new Error(`recipient: user_id Zalo không hợp lệ "${raw}" — một định danh, không khoảng trắng/ký tự đặc biệt`);
      }
      return [raw];
  }
}
