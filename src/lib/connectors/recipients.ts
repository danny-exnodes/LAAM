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
