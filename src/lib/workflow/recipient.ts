// Destination-safety gate for exfil-tools (spec 2026-06-09 §3.2). A connector tool that
// self-declares recipientField is recipient-controlled: every recipient in its RESOLVED
// arg must match the operator allowlist (WORKFLOW_RECIPIENT_ALLOWLIST). Uses the SHARED
// parseRecipients (the same parser the gmail handler rebuilds `To:` from → zero
// differential). Fail-closed: empty allowlist or any non-canonical / non-matching
// recipient throws.
import { CONNECTORS } from "@/lib/connectors/registry";
import { parseRecipients } from "@/lib/connectors/recipients";

// name → recipientField, derived from each connector tool's self-declaration (registry).
const RECIPIENT_FIELD: ReadonlyMap<string, string> = new Map(
  CONNECTORS.flatMap((c) =>
    c.tools.filter((t) => t.recipientField).map((t) => [t.function.name, t.recipientField as string] as const),
  ),
);

// Parse the operator allowlist env → lowercased set of entries (domain or full address).
// Read call-time so an env set after module load still applies; tests inject directly.
export function parseAllowlist(raw: string = process.env.WORKFLOW_RECIPIENT_ALLOWLIST ?? ""): ReadonlySet<string> {
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0));
}

export function assertRecipientAllowed(
  action: string,
  resolvedArgs: Record<string, unknown>,
  allowlist: ReadonlySet<string> = parseAllowlist(),
): void {
  const field = RECIPIENT_FIELD.get(action);
  if (!field) return; // not a recipient-controlled tool → no-op
  const recipients = parseRecipients(String(resolvedArgs[field] ?? "")); // throws on non-canonical (F2)
  for (const addr of recipients) {
    const domain = addr.slice(addr.indexOf("@") + 1);
    if (!allowlist.has(addr) && !allowlist.has(domain)) {
      throw new Error(`recipient: '${addr}' không thuộc allowlist (đặt WORKFLOW_RECIPIENT_ALLOWLIST)`);
    }
  }
}
