// Small display helpers (Vietnamese), shared by the monitoring pages.

export function ago(date: Date | null | undefined): string {
  if (!date) return "—";
  const d = Date.now() - new Date(date).getTime();
  if (d < 60_000) return "vừa xong";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} phút trước`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} giờ trước`;
  return `${Math.floor(d / 86_400_000)} ngày trước`;
}

export function usd(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v === 0) return "$0";
  if (v < 0.01) return "<$0.01";
  return "$" + v.toFixed(2);
}

export function num(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(v);
}

// Absolute timestamp for SSR-rendered text (e.g. machines "lần cuối …").
// Pins locale + 24h + timezone so the server (Node: en-US / UTC in the Docker
// container) and the client (browser: vi / Asia-Saigon) produce the IDENTICAL
// string — otherwise React hydration mismatches. Asia/Ho_Chi_Minh = team tz.
export function fmtDateTime(ts: string | number | Date | null | undefined): string {
  if (ts === null || ts === undefined || ts === "") return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export function shortModel(m: string | null | undefined): string {
  if (!m) return "unknown";
  return m.replace(/^claude-/, "").replace(/-20\d{6}$/, "");
}
