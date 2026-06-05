// Model có thể gửi tool arguments dạng object HOẶC chuỗi JSON (giống makeDispatch xử lý).
export function parseArgs(raw: unknown): Record<string, unknown> {
  let a: unknown = raw;
  if (typeof a === "string") {
    try { a = JSON.parse(a); } catch { a = {}; }
  }
  return a && typeof a === "object" ? (a as Record<string, unknown>) : {};
}

// Chuỗi chỉ-chữ-số (bỏ . , khoảng trắng) — để so khớp số khi model định dạng lại.
export function digitsOf(s: string): string {
  return s.replace(/[^\d]/g, "");
}

// Grounding: khớp text (case-insensitive) HOẶC nếu needle là số thì khớp theo
// dãy chữ số (model có thể viết 12.345 / 12,345 / 12 345).
export function contains(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (n && h.includes(n)) return true;
  if (/^\d[\d.,\s]*$/.test(needle.trim())) {
    const dn = digitsOf(needle);
    return dn.length > 0 && digitsOf(haystack).includes(dn);
  }
  return false;
}
