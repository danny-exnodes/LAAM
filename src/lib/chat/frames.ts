// Shared chat-stream frame envelope. SCHEMA FROZEN by SP-4 (spec §2.2): each frame
// = U+001E + one-line JSON + U+001E; the displayed text is every byte OUTSIDE the
// pairs. SP-2 landed the type + encodeFrame (server emit, "land-first" per lead).
// SP-4 adds splitFrames (client parse + D-SP4-2 partial-frame guard) to this file.
export const SEP = String.fromCharCode(0x1e); // U+001E record separator

export type ChatFrame =
  | { t: "tokens"; i: number; o: number }
  | { t: "tool"; phase: "call" | "result"; c: number; name: string; args?: string; ok?: boolean }
  | { t: "cite"; names: string[] }
  | { t: "pending_write"; token: string; tool: string; title: string; summary: string; fields?: unknown };

// The single emit path (always JSON.stringify → no raw SEP can leak into the JSON).
export function encodeFrame(f: ChatFrame): string {
  return SEP + JSON.stringify(f) + SEP;
}
