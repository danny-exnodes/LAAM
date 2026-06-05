// S5 — tolerant JSON parse for model-emitted ```chart / ```map blocks. A local
// model sometimes emits *almost* valid JSON (trailing commas, curly quotes, a
// stray code fence). Try strict JSON first, then a few conservative repairs.
// Returns null when still unparseable (callers show an error + the raw block).

export function looseJsonParse<T = unknown>(raw: string): T | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    /* fall through to repairs */
  }
  let s = raw.trim();
  // a code fence the model left inside the block
  s = s.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
  // curly/smart double-quotes → straight (we never touch single quotes — too risky)
  s = s.replace(/[“”]/g, '"');
  // trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
