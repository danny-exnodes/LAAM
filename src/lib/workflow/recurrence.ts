// Recurrence ↔ cron — PURE (no deps), mirrors cron.ts. The schedule backend stores
// a 5-field cron string; this module lets a friendly picker BUILD that string and
// PARSE an existing one back into a simple model. Only the 4 shapes the picker emits
// are recognized on parse — anything else (ranges, steps, dom+dow together, month
// restriction) returns null so the UI falls back to the raw-cron "Advanced" view.
//
// Field order (cron): min hour dom month dow. dow: 0=Sun … 6=Sat.

export type Recurrence =
  | { freq: "hourly"; minute: number } //                     every hour at :MM        → "M * * * *"
  | { freq: "daily"; hour: number; minute: number } //        every day at HH:MM        → "M H * * *"
  | { freq: "weekly"; weekdays: number[]; hour: number; minute: number } // sel. weekdays → "M H * * d,d"
  | { freq: "monthly"; day: number; hour: number; minute: number }; //     day-of-month   → "M H D * *"

export type Frequency = Recurrence["freq"];

// Build the 5-field cron for a recurrence. Assumes in-range fields (the picker
// constrains via selects); cron.ts/parseCron is the final range gate on save.
export function recurrenceToCron(r: Recurrence): string {
  switch (r.freq) {
    case "hourly":
      return `${r.minute} * * * *`;
    case "daily":
      return `${r.minute} ${r.hour} * * *`;
    case "weekly": {
      const days = [...new Set(r.weekdays)].sort((a, b) => a - b);
      return `${r.minute} ${r.hour} * * ${days.length ? days.join(",") : "*"}`;
    }
    case "monthly":
      return `${r.minute} ${r.hour} ${r.day} * *`;
  }
}

const isInt = (s: string) => /^\d+$/.test(s);
const inRange = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;

// Parse a cron string into a Recurrence, or null if it isn't one of the 4 picker
// shapes (→ caller shows Advanced raw-cron). Strict: month must be '*', and dom/dow
// are mutually exclusive (only one restricted) to avoid cron's confusing OR-of-both.
export function cronToRecurrence(cron: string): Recurrence | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, month, dow] = parts;
  if (month !== "*") return null; // month-specific schedules → Advanced

  // hourly: "M * * * *"
  if (isInt(min) && hour === "*" && dom === "*" && dow === "*") {
    const minute = Number(min);
    return inRange(minute, 0, 59) ? { freq: "hourly", minute } : null;
  }

  // daily: "M H * * *"
  if (isInt(min) && isInt(hour) && dom === "*" && dow === "*") {
    const minute = Number(min), h = Number(hour);
    return inRange(minute, 0, 59) && inRange(h, 0, 23) ? { freq: "daily", hour: h, minute } : null;
  }

  // weekly: "M H * * d[,d…]" — dow restricted, dom = '*'
  if (isInt(min) && isInt(hour) && dom === "*" && dow !== "*") {
    const days = dow.split(",");
    if (!days.every(isInt)) return null;
    const weekdays = [...new Set(days.map(Number))].sort((a, b) => a - b);
    if (!weekdays.every((d) => inRange(d, 0, 6))) return null;
    const minute = Number(min), h = Number(hour);
    return inRange(minute, 0, 59) && inRange(h, 0, 23) ? { freq: "weekly", weekdays, hour: h, minute } : null;
  }

  // monthly: "M H D * *" — dom restricted, dow = '*'
  if (isInt(min) && isInt(hour) && isInt(dom) && dow === "*") {
    const minute = Number(min), h = Number(hour), d = Number(dom);
    return inRange(minute, 0, 59) && inRange(h, 0, 23) && inRange(d, 1, 31)
      ? { freq: "monthly", day: d, hour: h, minute }
      : null;
  }

  return null; // ranges / steps / dom+dow together → Advanced
}

// Sensible defaults when the user switches frequency in the picker.
export function defaultRecurrence(freq: Frequency): Recurrence {
  switch (freq) {
    case "hourly":
      return { freq: "hourly", minute: 0 };
    case "daily":
      return { freq: "daily", hour: 9, minute: 0 };
    case "weekly":
      return { freq: "weekly", weekdays: [1], hour: 9, minute: 0 }; // Monday
    case "monthly":
      return { freq: "monthly", day: 1, hour: 9, minute: 0 };
  }
}

// "HH:MM" for previews (zero-padded, 24h). Pure helper shared by picker + tests.
export function formatHHMM(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
