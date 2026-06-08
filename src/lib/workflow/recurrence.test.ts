import { describe, expect, test } from "vitest";
import {
  recurrenceToCron,
  cronToRecurrence,
  defaultRecurrence,
  formatHHMM,
  type Recurrence,
} from "./recurrence";
import { parseCron } from "./cron";

describe("recurrenceToCron", () => {
  test("hourly → 'M * * * *'", () => {
    expect(recurrenceToCron({ freq: "hourly", minute: 30 })).toBe("30 * * * *");
  });
  test("daily → 'M H * * *'", () => {
    expect(recurrenceToCron({ freq: "daily", hour: 9, minute: 0 })).toBe("0 9 * * *");
  });
  test("weekly → 'M H * * d,d' (deduped + sorted)", () => {
    expect(recurrenceToCron({ freq: "weekly", weekdays: [5, 1, 1], hour: 8, minute: 30 })).toBe("30 8 * * 1,5");
  });
  test("weekly with no days → dow '*' (degrades to daily-at-time)", () => {
    expect(recurrenceToCron({ freq: "weekly", weekdays: [], hour: 8, minute: 0 })).toBe("0 8 * * *");
  });
  test("monthly → 'M H D * *'", () => {
    expect(recurrenceToCron({ freq: "monthly", day: 15, hour: 12, minute: 0 })).toBe("0 12 15 * *");
  });
});

// The cron we emit MUST be accepted by the real parser — otherwise the picker
// produces schedules the scheduler rejects. (Rule 9: test the contract.)
describe("recurrenceToCron output always parses via cron.ts", () => {
  const samples: Recurrence[] = [
    { freq: "hourly", minute: 0 },
    { freq: "daily", hour: 23, minute: 59 },
    { freq: "weekly", weekdays: [0, 6], hour: 6, minute: 15 },
    { freq: "monthly", day: 31, hour: 0, minute: 0 },
  ];
  for (const r of samples) {
    test(`${r.freq} → valid cron`, () => {
      expect(() => parseCron(recurrenceToCron(r))).not.toThrow();
    });
  }
});

describe("cronToRecurrence", () => {
  test("parses hourly", () => {
    expect(cronToRecurrence("30 * * * *")).toEqual({ freq: "hourly", minute: 30 });
  });
  test("parses daily", () => {
    expect(cronToRecurrence("0 9 * * *")).toEqual({ freq: "daily", hour: 9, minute: 0 });
  });
  test("parses weekly (deduped + sorted)", () => {
    expect(cronToRecurrence("30 8 * * 5,1")).toEqual({ freq: "weekly", weekdays: [1, 5], hour: 8, minute: 30 });
  });
  test("parses monthly", () => {
    expect(cronToRecurrence("0 12 15 * *")).toEqual({ freq: "monthly", day: 15, hour: 12, minute: 0 });
  });

  test("round-trips every frequency (cron → model → cron)", () => {
    const samples: Recurrence[] = [
      { freq: "hourly", minute: 5 },
      { freq: "daily", hour: 7, minute: 45 },
      { freq: "weekly", weekdays: [1, 3, 5], hour: 18, minute: 0 },
      { freq: "monthly", day: 1, hour: 0, minute: 0 },
    ];
    for (const r of samples) {
      expect(cronToRecurrence(recurrenceToCron(r))).toEqual(r);
    }
  });

  describe("returns null for crons the picker can't represent (→ Advanced)", () => {
    test.each([
      ["wrong field count", "0 9 * *"],
      ["step minute (every 15m)", "*/15 * * * *"],
      ["every minute", "* * * * *"],
      ["range hour", "0 9-17 * * *"],
      ["list of hours", "0 9,17 * * *"],
      ["month-restricted", "0 9 1 6 *"],
      ["dom AND dow together", "0 9 1 * 1"],
      ["minute out of range", "99 * * * *"],
      ["hour out of range", "0 25 * * *"],
      ["day-of-month out of range", "0 9 40 * *"],
      ["weekday out of range", "0 9 * * 9"],
    ])("null for %s", (_label, cron) => {
      expect(cronToRecurrence(cron)).toBeNull();
    });
  });
});

describe("defaultRecurrence", () => {
  test("each frequency has a sensible default", () => {
    expect(defaultRecurrence("hourly")).toEqual({ freq: "hourly", minute: 0 });
    expect(defaultRecurrence("daily")).toEqual({ freq: "daily", hour: 9, minute: 0 });
    expect(defaultRecurrence("weekly")).toEqual({ freq: "weekly", weekdays: [1], hour: 9, minute: 0 });
    expect(defaultRecurrence("monthly")).toEqual({ freq: "monthly", day: 1, hour: 9, minute: 0 });
  });
  test("every default round-trips through cron", () => {
    (["hourly", "daily", "weekly", "monthly"] as const).forEach((f) => {
      const r = defaultRecurrence(f);
      expect(cronToRecurrence(recurrenceToCron(r))).toEqual(r);
    });
  });
});

describe("formatHHMM", () => {
  test("zero-pads hour + minute", () => {
    expect(formatHHMM(9, 5)).toBe("09:05");
    expect(formatHHMM(23, 0)).toBe("23:00");
    expect(formatHHMM(0, 0)).toBe("00:00");
  });
});
