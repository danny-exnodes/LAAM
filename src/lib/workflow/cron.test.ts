import { describe, expect, test } from "vitest";
import { parseCron, matchesCron, nextRunAt } from "./cron";

// Cron tính theo giờ SERVER-LOCAL (v1; tz/DST hoãn). Dùng Date local constructor
// (new Date(y, monthIndex, d, h, m)) — KHÔNG ISO 'Z' — để khớp ngữ nghĩa local.
const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 0, 0);

describe("parseCron", () => {
  test("phân tích 5 field hợp lệ", () => {
    const c = parseCron("*/5 0 1 * *");
    // mỗi field = matcher fn (number) => boolean
    expect(c.min(0)).toBe(true);
    expect(c.min(5)).toBe(true);
    expect(c.min(3)).toBe(false);
    expect(c.hour(0)).toBe(true);
    expect(c.hour(1)).toBe(false);
    expect(c.dom(1)).toBe(true);
    expect(c.dom(2)).toBe(false);
    expect(c.month(7)).toBe(true); // '*'
    expect(c.dow(3)).toBe(true); // '*'
  });

  test("'*' khớp mọi giá trị trong range", () => {
    const c = parseCron("* * * * *");
    expect(c.min(0)).toBe(true);
    expect(c.min(59)).toBe(true);
    expect(c.hour(23)).toBe(true);
  });

  test("int đơn chỉ khớp đúng giá trị", () => {
    const c = parseCron("30 8 * * *");
    expect(c.min(30)).toBe(true);
    expect(c.min(31)).toBe(false);
    expect(c.hour(8)).toBe(true);
    expect(c.hour(7)).toBe(false);
  });

  test("range a-b (bao gồm 2 đầu)", () => {
    const c = parseCron("0 9-17 * * *");
    expect(c.hour(9)).toBe(true);
    expect(c.hour(13)).toBe(true);
    expect(c.hour(17)).toBe(true);
    expect(c.hour(8)).toBe(false);
    expect(c.hour(18)).toBe(false);
  });

  test("list a,b", () => {
    const c = parseCron("0 8,20 * * *");
    expect(c.hour(8)).toBe(true);
    expect(c.hour(20)).toBe(true);
    expect(c.hour(12)).toBe(false);
  });

  test("*/n step trên toàn range", () => {
    const c = parseCron("*/15 * * * *");
    expect([0, 15, 30, 45].every((m) => c.min(m))).toBe(true);
    expect([1, 14, 16, 59].some((m) => c.min(m))).toBe(false);
  });

  test.each([
    ["", "rỗng"],
    ["* * * *", "4 field"],
    ["* * * * * *", "6 field"],
    ["60 * * * *", "min ngoài range"],
    ["* 24 * * *", "hour ngoài range"],
    ["* * 0 * *", "dom < 1"],
    ["* * 32 * *", "dom > 31"],
    ["* * * 13 *", "month > 12"],
    ["* * * * 7", "dow > 6"],
    ["abc * * * *", "không phải số"],
    ["5-2 * * * *", "range nghịch"],
    ["*/0 * * * *", "step 0"],
  ])("ném lỗi với cron không hợp lệ: %s (%s)", (bad) => {
    expect(() => parseCron(bad)).toThrow();
  });
});

describe("matchesCron", () => {
  test("khớp đúng phút", () => {
    expect(matchesCron("0 8 * * *", local(2026, 6, 5, 8, 0))).toBe(true);
    expect(matchesCron("0 8 * * *", local(2026, 6, 5, 8, 1))).toBe(false);
    expect(matchesCron("0 8 * * *", local(2026, 6, 5, 9, 0))).toBe(false);
  });

  test("dom + dow đều giới hạn → khớp NẾU một trong hai khớp (Vixie OR)", () => {
    // "0 0 1 * 0" = 00:00 ngày 1 HOẶC Chủ nhật. 2026-06-01 là thứ Hai (dow=1).
    expect(local(2026, 6, 1, 0, 0).getDay()).toBe(1); // sanity: thứ Hai
    expect(matchesCron("0 0 1 * 0", local(2026, 6, 1, 0, 0))).toBe(true); // khớp dom=1
    // 2026-06-07 là Chủ nhật (dow=0), không phải ngày 1 → vẫn khớp qua dow.
    expect(local(2026, 6, 7, 0, 0).getDay()).toBe(0);
    expect(matchesCron("0 0 1 * 0", local(2026, 6, 7, 0, 0))).toBe(true);
    // 2026-06-03 (thứ Tư, dow=3), không phải ngày 1 → KHÔNG khớp.
    expect(matchesCron("0 0 1 * 0", local(2026, 6, 3, 0, 0))).toBe(false);
  });

  test("dom giới hạn, dow='*' → chỉ theo dom", () => {
    expect(matchesCron("0 0 1 * *", local(2026, 6, 1, 0, 0))).toBe(true);
    expect(matchesCron("0 0 1 * *", local(2026, 6, 2, 0, 0))).toBe(false);
  });
});

describe("nextRunAt", () => {
  test("*/5 từ 12:02 → 12:05", () => {
    const next = nextRunAt("*/5 * * * *", local(2026, 6, 5, 12, 2));
    expect(next).toEqual(local(2026, 6, 5, 12, 5));
  });

  test("*/5 từ đúng 12:05 → 12:10 (strictly after, không trả lại chính nó)", () => {
    const next = nextRunAt("*/5 * * * *", local(2026, 6, 5, 12, 5));
    expect(next).toEqual(local(2026, 6, 5, 12, 10));
  });

  test("0 8 * * * → 08:00 hôm sau khi 'from' đã qua 08:00", () => {
    const next = nextRunAt("0 8 * * *", local(2026, 6, 5, 9, 30));
    expect(next).toEqual(local(2026, 6, 6, 8, 0));
  });

  test("0 8 * * * → 08:00 cùng ngày khi 'from' trước 08:00", () => {
    const next = nextRunAt("0 8 * * *", local(2026, 6, 5, 7, 0));
    expect(next).toEqual(local(2026, 6, 5, 8, 0));
  });

  test("0 0 1 * * → 00:00 ngày 1 tháng sau", () => {
    const next = nextRunAt("0 0 1 * *", local(2026, 6, 15, 10, 0));
    expect(next).toEqual(local(2026, 7, 1, 0, 0));
  });

  test("0 8,20 * * * (list) → mốc kế đúng", () => {
    expect(nextRunAt("0 8,20 * * *", local(2026, 6, 5, 9, 0))).toEqual(local(2026, 6, 5, 20, 0));
    expect(nextRunAt("0 8,20 * * *", local(2026, 6, 5, 21, 0))).toEqual(local(2026, 6, 6, 8, 0));
  });

  test("0 9-17 * * * (range) → trong giờ làm, mỗi giờ", () => {
    expect(nextRunAt("0 9-17 * * *", local(2026, 6, 5, 9, 30))).toEqual(local(2026, 6, 5, 10, 0));
    expect(nextRunAt("0 9-17 * * *", local(2026, 6, 5, 17, 30))).toEqual(local(2026, 6, 6, 9, 0));
  });

  test("bỏ giây/mili của 'from' (mốc kế luôn trên ranh giới phút)", () => {
    const from = new Date(2026, 5, 5, 12, 2, 33, 777);
    const next = nextRunAt("*/5 * * * *", from);
    expect(next).toEqual(local(2026, 6, 5, 12, 5));
    expect(next.getSeconds()).toBe(0);
    expect(next.getMilliseconds()).toBe(0);
  });

  test("ném lỗi nếu cron không hợp lệ", () => {
    expect(() => nextRunAt("nope", local(2026, 6, 5, 0, 0))).toThrow();
  });
});
