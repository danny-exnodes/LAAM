// Cron hand-rolled, 5-field, THUẦN (không npm dep — Rule "no new deps"). Field:
// min hour dom month dow. Mỗi field = list các term, term ∈ {'*', int, a-b, '*/n',
// 'a-b/n'}. nextRunAt iterate phút-by-phút (cap 366 ngày). TZ = giờ SERVER-LOCAL
// cho v1 — tz/DST hoãn (spec scheduler "TZ = server-local for v1"). dom+dow đều
// giới hạn → khớp NẾU một trong hai (ngữ nghĩa Vixie cron, chuẩn).

export type CronField = (n: number) => boolean;
export type ParsedCron = {
  min: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
  // Giữ raw để biết field có bị giới hạn không (cho luật dom/dow OR).
  domRestricted: boolean;
  dowRestricted: boolean;
};

type Range = { lo: number; hi: number };
const RANGES: Record<"min" | "hour" | "dom" | "month" | "dow", Range> = {
  min: { lo: 0, hi: 59 },
  hour: { lo: 0, hi: 23 },
  dom: { lo: 1, hi: 31 },
  month: { lo: 1, hi: 12 },
  dow: { lo: 0, hi: 6 },
};

// Phân tích 1 field → Set các giá trị hợp lệ trong [lo,hi]. Ném lỗi nếu sai cú pháp
// hoặc ngoài range. (Không hỗ trợ tên tháng/thứ dạng chữ ở v1.)
function parseField(raw: string, range: Range): Set<number> {
  if (raw === "") throw new Error(`cron: field rỗng`);
  const out = new Set<number>();
  for (const term of raw.split(",")) {
    if (term === "") throw new Error(`cron: term rỗng trong "${raw}"`);
    // Tách step "x/n"
    const slash = term.indexOf("/");
    let base = term;
    let step = 1;
    if (slash >= 0) {
      base = term.slice(0, slash);
      const stepStr = term.slice(slash + 1);
      step = Number(stepStr);
      if (!/^\d+$/.test(stepStr) || step < 1) throw new Error(`cron: step không hợp lệ "${term}"`);
    }

    let lo: number;
    let hi: number;
    if (base === "*") {
      lo = range.lo;
      hi = range.hi;
    } else if (base.includes("-")) {
      const [a, b] = base.split("-");
      if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) throw new Error(`cron: range không hợp lệ "${term}"`);
      lo = Number(a);
      hi = Number(b);
      if (lo > hi) throw new Error(`cron: range nghịch "${term}"`);
    } else {
      if (!/^\d+$/.test(base)) throw new Error(`cron: giá trị không phải số "${term}"`);
      lo = Number(base);
      hi = Number(base);
    }
    if (lo < range.lo || hi > range.hi) {
      throw new Error(`cron: "${term}" ngoài range [${range.lo},${range.hi}]`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  if (out.size === 0) throw new Error(`cron: field "${raw}" không khớp giá trị nào`);
  return out;
}

export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (expr.trim() === "" || parts.length !== 5) {
    throw new Error(`cron: cần đúng 5 field, nhận ${expr.trim() === "" ? 0 : parts.length} ("${expr}")`);
  }
  const [minR, hourR, domR, monthR, dowR] = parts;
  const minS = parseField(minR, RANGES.min);
  const hourS = parseField(hourR, RANGES.hour);
  const domS = parseField(domR, RANGES.dom);
  const monthS = parseField(monthR, RANGES.month);
  const dowS = parseField(dowR, RANGES.dow);
  return {
    min: (n) => minS.has(n),
    hour: (n) => hourS.has(n),
    dom: (n) => domS.has(n),
    month: (n) => monthS.has(n),
    dow: (n) => dowS.has(n),
    domRestricted: domR !== "*",
    dowRestricted: dowR !== "*",
  };
}

// Khớp 1 thời điểm (độ phân giải phút) với cron. Đọc thành phần theo giờ LOCAL.
// Luật ngày: nếu CẢ dom và dow đều bị giới hạn → ngày khớp nếu MỘT trong hai khớp
// (Vixie). Nếu chỉ một bị giới hạn → theo cái đó. Nếu cả hai '*' → mọi ngày.
function dayMatches(c: ParsedCron, date: Date): boolean {
  const dom = c.dom(date.getDate());
  const dow = c.dow(date.getDay());
  if (c.domRestricted && c.dowRestricted) return dom || dow;
  if (c.domRestricted) return dom;
  if (c.dowRestricted) return dow;
  return true; // cả hai '*'
}

export function matchesCron(expr: string, date: Date): boolean {
  const c = parseCron(expr);
  return matchesParsed(c, date);
}

function matchesParsed(c: ParsedCron, date: Date): boolean {
  return (
    c.min(date.getMinutes()) &&
    c.hour(date.getHours()) &&
    c.month(date.getMonth() + 1) && // getMonth 0-based
    dayMatches(c, date)
  );
}

const MAX_MINUTES = 366 * 24 * 60; // cap ~527040 phút (1 năm nhuận) — chống vòng vô hạn

// Mốc phút nhỏ nhất STRICTLY > from khớp cron. Iterate phút-by-phút trên giờ local
// (cộng phút vào Date xử lý DST/rollover tháng-năm tự nhiên qua engine của JS Date).
export function nextRunAt(expr: string, from: Date): Date {
  const c = parseCron(expr); // ném nếu cron sai
  // Bắt đầu ở ranh giới phút kế tiếp sau `from` (bỏ giây/mili, +1 phút) → đảm bảo
  // strictly-after kể cả khi `from` đúng ngay một mốc khớp.
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), from.getHours(), from.getMinutes() + 1, 0, 0);
  for (let i = 0; i < MAX_MINUTES; i++) {
    if (matchesParsed(c, d)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  throw new Error(`cron: không tìm thấy mốc kế trong 366 ngày cho "${expr}"`);
}
