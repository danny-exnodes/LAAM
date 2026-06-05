// Scrub credential-looking substrings before tool output/args reach model
// context, the confirm preview, or the audit log. Trello passes key+token in the
// query string (lib/connectors/trello.ts:15) — an echoed URL would leak creds.

const PLACEHOLDER = "‹redacted›";

export function redactString(s: string): string {
  return s
    .replace(/([?&](?:key|token|api_key|access_token|password|secret)=)[^&\s"']+/gi, (_m, p1) => `${p1}${PLACEHOLDER}`)
    .replace(/(Bearer\s+)[\w.\-]+/gi, (_m, p1) => `${p1}${PLACEHOLDER}`)
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, () => PLACEHOLDER);
}

// Deep-redact every string inside an object/array. Returns a NEW value; never
// mutates the input. Non-string leaves pass through unchanged.
export function redact<T>(value: T): T {
  if (typeof value === "string") return redactString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redact(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redact(v);
    return out as T;
  }
  return value;
}
