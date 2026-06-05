// Conversation title derivation. The chat message persisted for a turn prepends
// attachment blocks ("--- Tệp:|URL: name ---\n<content>") before the user's text,
// which can make a file's raw bytes leak into the title. Two entry points:
//   deriveConvTitle  — NEW conversations: prefer the FE's titleHint (raw user text)
//   retitleFromMessage — BACKFILL old conversations from their stored first message
// Both keep titles short and never let raw bytes through (Rule 13).

const ATT = /^--- (?:Tệp|URL): (.+?) ---/;

// New conversation: the FE sends titleHint (raw user text); fall back to the first
// attachment's NAME (never its bytes) for direct/no-hint callers.
export function deriveConvTitle(message: string, titleHint?: string): string {
  const hint = (titleHint ?? "").trim();
  if (hint) return hint.slice(0, 60);
  const m = message.match(ATT);
  if (m) return m[1].slice(0, 60);
  return message.slice(0, 60);
}

// Fraction of characters that are normal printable text (not control bytes).
// Unicode letters count as printable; NUL/control and the replacement char don't.
function printableRatio(s: string): number {
  if (!s.length) return 0;
  let ok = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\n" || ch === "\t" || (c >= 0x20 && c !== 0xfffd)) ok++;
  }
  return ok / [...s].length;
}

// Backfill: re-derive a clean title from a stored (attachment-prefixed) message.
// Prefers the user's trailing text (last clean paragraph past the blocks); falls
// back to the attachment filename, then the message head.
export function retitleFromMessage(message: string): string {
  const msg = (message ?? "").trim();
  if (!msg) return "";
  if (!ATT.test(msg)) return msg.slice(0, 60);

  const paras = msg.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i];
    if (ATT.test(p)) continue; // an attachment header/block, not user text
    if (p.length <= 200 && printableRatio(p) > 0.9) return p.slice(0, 60);
  }
  const m = msg.match(ATT);
  return m ? m[1].slice(0, 60) : msg.slice(0, 60);
}
