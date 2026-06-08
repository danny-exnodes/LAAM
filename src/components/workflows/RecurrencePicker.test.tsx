import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecurrencePicker, describeCron } from "./RecurrencePicker";

// identity t → i18n keys surface as the visible labels (easy to query)
const t = (k: string) => k;

function setup(initialCron?: string) {
  const onChange = vi.fn();
  render(<RecurrencePicker initialCron={initialCron} onChange={onChange} t={t} />);
  const lastCron = () => onChange.mock.calls.at(-1)?.[0] as string | undefined;
  return { onChange, lastCron };
}

describe("RecurrencePicker", () => {
  test("emits a default daily cron on mount (create mode)", () => {
    const { lastCron } = setup("");
    expect(lastCron()).toBe("0 9 * * *");
  });

  test("switching to weekly emits a weekly cron with the default weekday", () => {
    const { lastCron } = setup("");
    fireEvent.click(screen.getByRole("button", { name: "wf.recur.freq.weekly" }));
    expect(lastCron()).toBe("0 9 * * 1");
  });

  test("toggling weekdays updates the cron (sorted, deduped)", () => {
    const { lastCron } = setup("");
    fireEvent.click(screen.getByRole("button", { name: "wf.recur.freq.weekly" }));
    fireEvent.click(screen.getByRole("button", { name: "wf.recur.dow.3" })); // add Wed
    expect(lastCron()).toBe("0 9 * * 1,3");
  });

  test("switching to hourly emits an hourly cron", () => {
    const { lastCron } = setup("");
    fireEvent.click(screen.getByRole("button", { name: "wf.recur.freq.hourly" }));
    expect(lastCron()).toBe("0 * * * *");
  });

  test("changing the time updates a daily cron", () => {
    const { lastCron } = setup("");
    fireEvent.change(screen.getByLabelText("wf.recur.atTime"), { target: { value: "08:30" } });
    expect(lastCron()).toBe("30 8 * * *");
  });

  test("Advanced mode lets you type a raw cron the picker can't model", () => {
    const { lastCron } = setup("");
    fireEvent.click(screen.getByRole("button", { name: "wf.recur.advanced" }));
    fireEvent.change(screen.getByPlaceholderText("0 9 * * 1-5"), { target: { value: "*/15 * * * *" } });
    expect(lastCron()).toBe("*/15 * * * *");
  });

  test("seeds from an existing daily cron (time input reflects it)", () => {
    const { lastCron } = setup("30 8 * * *");
    expect((screen.getByLabelText("wf.recur.atTime") as HTMLInputElement).value).toBe("08:30");
    expect(lastCron()).toBe("30 8 * * *");
  });

  test("a custom cron opens directly in Advanced mode", () => {
    const { lastCron } = setup("*/15 * * * *");
    expect((screen.getByPlaceholderText("0 9 * * 1-5") as HTMLInputElement).value).toBe("*/15 * * * *");
    expect(lastCron()).toBe("*/15 * * * *");
  });
});

describe("describeCron", () => {
  test("daily → friendly text", () => {
    expect(describeCron("0 9 * * *", t)).toBe("wf.recur.dailyAt 09:00");
  });
  test("weekly → weekday labels + time", () => {
    expect(describeCron("30 8 * * 1,3", t)).toBe("wf.recur.dow.1, wf.recur.dow.3 · 08:30");
  });
  test("hourly → minute", () => {
    expect(describeCron("15 * * * *", t)).toBe("wf.recur.hourlyAt :15");
  });
  test("monthly → day + time", () => {
    expect(describeCron("0 12 15 * *", t)).toBe("wf.recur.day 15 · 12:00");
  });
  test("custom cron the picker can't model → raw string", () => {
    expect(describeCron("*/15 * * * *", t)).toBe("*/15 * * * *");
  });
});
