import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ActivityTimeline, mapActivity } from "./ActivityTimeline";

const wrap = (ui: React.ReactNode) =>
  render(<I18nProvider lang="vi">{ui}</I18nProvider>);

// 2026-01-02T00:00:00Z and 2026-01-02T01:00:00Z are 1h apart → hourly labels.
const HOUR = 3_600_000;
const DAY = 86_400_000;
const t0 = Date.UTC(2026, 0, 2, 0, 0, 0);

describe("mapActivity (pure)", () => {
  it("returns [] for empty input", () => {
    expect(mapActivity([])).toEqual([]);
  });

  it("carries sessions and tokens through unchanged", () => {
    const r = mapActivity([
      { t: t0, sessions: 3, tokens: 1200 },
      { t: t0 + HOUR, sessions: 5, tokens: 800 },
    ]);
    expect(r.map((x) => x.sessions)).toEqual([3, 5]);
    expect(r.map((x) => x.tokens)).toEqual([1200, 800]);
  });

  it("uses hourly labels when buckets are < 1 day apart", () => {
    const r = mapActivity([
      { t: t0, sessions: 1, tokens: 1 },
      { t: t0 + HOUR, sessions: 1, tokens: 1 },
    ]);
    // hourly format is "DD HHh" — must contain an hour marker, not a slash date.
    expect(r[0].label).toMatch(/h$/);
    expect(r[0].label).not.toContain("/");
  });

  it("uses daily labels when buckets are >= 1 day apart", () => {
    const r = mapActivity([
      { t: t0, sessions: 1, tokens: 1 },
      { t: t0 + DAY, sessions: 1, tokens: 1 },
    ]);
    // daily format is "MM/DD" — contains a slash, no hour marker.
    expect(r[0].label).toContain("/");
    expect(r[0].label).not.toMatch(/h$/);
  });

  it("treats a single point as hourly", () => {
    const r = mapActivity([{ t: t0, sessions: 2, tokens: 9 }]);
    expect(r).toHaveLength(1);
    expect(r[0].label).toMatch(/h$/);
  });
});

describe("ActivityTimeline (render)", () => {
  it("renders its title with data without throwing", () => {
    const { getByText } = wrap(
      <ActivityTimeline
        activity={[
          { t: t0, sessions: 3, tokens: 1200 },
          { t: t0 + HOUR, sessions: 5, tokens: 800 },
        ]}
      />,
    );
    expect(getByText("Hoạt động theo thời gian")).toBeTruthy();
  });

  it("shows an empty state when there is no activity", () => {
    const { getByText } = wrap(<ActivityTimeline activity={[]} />);
    expect(getByText("Chưa có dữ liệu.")).toBeTruthy();
  });
});
