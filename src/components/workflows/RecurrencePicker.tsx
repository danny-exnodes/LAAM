"use client";

// Friendly schedule picker — produces a 5-field cron string for the schedule
// backend (which is unchanged). Four frequencies (hourly/daily/weekly/monthly)
// plus an "Advanced" raw-cron escape hatch for anything the picker can't model.
// `t` is injected (same pattern as NodeConfigPanel sub-forms) so this stays
// decoupled + unit-testable.

import { useEffect, useMemo, useState } from "react";
import {
  recurrenceToCron,
  cronToRecurrence,
  defaultRecurrence,
  formatHHMM,
  type Recurrence,
  type Frequency,
} from "@/lib/workflow/recurrence";
import { parseCron } from "@/lib/workflow/cron";

type T = (key: string) => string;

const FREQS: Frequency[] = ["hourly", "daily", "weekly", "monthly"];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]; // cron dow: 0=Sun … 6=Sat

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isNaN(n) ? lo : n));

const chip = (active: boolean) =>
  "rounded-lg border px-2.5 py-1 text-xs font-medium transition " +
  (active
    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
    : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-300");

const fieldCls =
  "rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)] dark:border-neutral-700 dark:bg-neutral-950";

/**
 * Human-readable description of a cron for the schedule list. Custom crons the
 * picker can't model fall through to the raw string.
 */
export function describeCron(cron: string, t: T): string {
  const r = cronToRecurrence(cron);
  if (!r) return cron;
  switch (r.freq) {
    case "hourly":
      return `${t("wf.recur.hourlyAt")} :${String(r.minute).padStart(2, "0")}`;
    case "daily":
      return `${t("wf.recur.dailyAt")} ${formatHHMM(r.hour, r.minute)}`;
    case "weekly":
      return `${r.weekdays.map((d) => t(`wf.recur.dow.${d}`)).join(", ")} · ${formatHHMM(r.hour, r.minute)}`;
    case "monthly":
      return `${t("wf.recur.day")} ${r.day} · ${formatHHMM(r.hour, r.minute)}`;
  }
}

export function RecurrencePicker({
  initialCron,
  onChange,
  t,
}: {
  /** Seed the picker from an existing cron (edit mode); empty → create defaults. */
  initialCron?: string;
  /** Emits the current cron string (on mount + on every change). Pass a STABLE setter. */
  onChange: (cron: string) => void;
  t: T;
}) {
  const seeded = useMemo(() => (initialCron ? cronToRecurrence(initialCron) : null), [initialCron]);
  const [advanced, setAdvanced] = useState(!!initialCron && seeded === null);
  const [rec, setRec] = useState<Recurrence>(seeded ?? defaultRecurrence("daily"));
  const [raw, setRaw] = useState(initialCron ?? "");

  const cron = advanced ? raw.trim() : recurrenceToCron(rec);

  const rawValid = useMemo(() => {
    if (!advanced) return true;
    if (!raw.trim()) return false;
    try {
      parseCron(raw.trim());
      return true;
    } catch {
      return false;
    }
  }, [advanced, raw]);

  // Lift the cron up. onChange must be stable (a useState setter) to avoid re-emits.
  useEffect(() => {
    onChange(cron);
  }, [cron, onChange]);

  // Time = "HH:MM" for the frequencies that carry an hour (daily/weekly/monthly).
  const time = "hour" in rec ? formatHHMM(rec.hour, rec.minute) : "";
  const setTime = (hhmm: string) => {
    const [h, m] = hhmm.split(":");
    const hour = Number(h);
    const minute = Number(m);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return;
    setRec((r) => ("hour" in r ? { ...r, hour, minute } : r));
  };

  const toggleWeekday = (d: number) =>
    setRec((r) => {
      if (r.freq !== "weekly") return r;
      const has = r.weekdays.includes(d);
      // keep at least one day selected
      if (has && r.weekdays.length === 1) return r;
      const weekdays = (has ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d]).sort((a, b) => a - b);
      return { ...r, weekdays };
    });

  return (
    <div className="flex w-full flex-col gap-2.5" data-testid="recurrence-picker">
      {/* Frequency tabs + Advanced toggle */}
      <div className="flex flex-wrap items-center gap-1.5">
        {!advanced &&
          FREQS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setRec(defaultRecurrence(f))}
              className={chip(rec.freq === f)}
              aria-pressed={rec.freq === f}
            >
              {t(`wf.recur.freq.${f}`)}
            </button>
          ))}
        <button
          type="button"
          onClick={() => {
            if (!advanced) setRaw(recurrenceToCron(rec)); // carry current selection into raw
            setAdvanced((a) => !a);
          }}
          className={"ml-auto text-xs underline " + (advanced ? "text-[var(--color-accent)]" : "text-neutral-500")}
        >
          {advanced ? t("wf.recur.simple") : t("wf.recur.advanced")}
        </button>
      </div>

      {advanced ? (
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="0 9 * * 1-5"
          aria-label={t("wf.detail.cronLabel")}
          className={fieldCls + " w-full font-mono"}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {rec.freq === "hourly" && (
            <label className="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
              {t("wf.recur.atMinute")}
              <input
                type="number"
                min={0}
                max={59}
                value={rec.minute}
                onChange={(e) => setRec({ freq: "hourly", minute: clamp(Number(e.target.value), 0, 59) })}
                className={fieldCls + " w-16"}
                aria-label={t("wf.recur.atMinute")}
              />
            </label>
          )}

          {rec.freq === "weekly" && (
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleWeekday(d)}
                  className={chip(rec.weekdays.includes(d))}
                  aria-pressed={rec.weekdays.includes(d)}
                >
                  {t(`wf.recur.dow.${d}`)}
                </button>
              ))}
            </div>
          )}

          {rec.freq === "monthly" && (
            <label className="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
              {t("wf.recur.dayOfMonth")}
              <select
                value={rec.day}
                onChange={(e) => setRec({ ...rec, day: Number(e.target.value) })}
                className={fieldCls}
                aria-label={t("wf.recur.dayOfMonth")}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}

          {rec.freq !== "hourly" && (
            <label className="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
              {t("wf.recur.atTime")}
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={fieldCls}
                aria-label={t("wf.recur.atTime")}
              />
            </label>
          )}
        </div>
      )}

      {/* Live preview + the generated cron (transparency) */}
      <p className="text-xs text-neutral-500">
        <span className="font-medium">{t("wf.recur.runs")}:</span>{" "}
        {advanced && !rawValid ? (
          <span className="text-red-500">{t("wf.detail.cronErr")}</span>
        ) : (
          <>
            {describeCron(cron, t)}
            <span className="ml-2 font-mono text-neutral-400">{cron}</span>
          </>
        )}
      </p>
    </div>
  );
}
