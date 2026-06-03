// stuck.ts — port of v1 `isStuck` (public/common.js).
//
// A session is "stuck" if it isn't done yet but hasn't written its transcript
// for longer than the configured threshold. The threshold is supplied by the
// caller (v1 reads it from /api/config; the hook passes the same value).

/** Coerce a number (epoch ms) or Date into epoch ms; null/undefined → null. */
function toMs(t: number | Date | null | undefined): number | null {
  if (t == null) return null;
  return t instanceof Date ? t.getTime() : t;
}

export function isStuck(
  s: { status: string; lastActivity: number | Date | null | undefined },
  thresholdMin: number,
  now: number = Date.now(),
): boolean {
  if (!s || s.status === "done") return false;
  const last = toMs(s.lastActivity);
  if (last == null) return false;
  return now - last > thresholdMin * 60 * 1000;
}
