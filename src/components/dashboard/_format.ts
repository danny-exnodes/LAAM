// Duration formatter for the dashboard tables — ported from v1 public/common.js
// `fmtDur` (h/m/s). `@/lib/format` intentionally has no duration helper, so the
// dashboard widgets share this one. Null/negative renders as an em dash.
export function fmtDur(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}
