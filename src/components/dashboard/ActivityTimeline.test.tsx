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

// Build an activity point; mapActivity only reads t/sessions/tokens, so the
// in/out/cost fields (added in v2) just satisfy the type here.
const A = (t: number, sessions: number, tokens: number) => ({
  t,
  sessions,
  tokens,
  tokensIn: 0,
  tokensOut: 0,
  cost: 0,
});

describe("mapActivity (pure)", () => {
  it("returns [] for empty input", () => {
    expect(mapActivity([])).toEqual([]);
  });

  it("carries sessions and tokens through unchanged", () => {
    const r = mapActivity([
      A(t0, 3, 1200),
      A(t0 + HOUR, 5, 800),
    ]);
    expect(r.map((x) => x.sessions)).toEqual([3, 5]);
    expect(r.map((x) => x.tokens)).toEqual([1200, 800]);
  });

  it("uses hourly labels when buckets are < 1 day apart", () => {
    const r = mapActivity([
      A(t0, 1, 1),
      A(t0 + HOUR, 1, 1),
    ]);
    // hourly format is "DD HHh" — must contain an hour marker, not a slash date.
    expect(r[0].label).toMatch(/h$/);
    expect(r[0].label).not.toContain("/");
  });

  it("uses daily labels when buckets are >= 1 day apart", () => {
    const r = mapActivity([
      A(t0, 1, 1),
      A(t0 + DAY, 1, 1),
    ]);
    // daily format is "MM/DD" — contains a slash, no hour marker.
    expect(r[0].label).toContain("/");
    expect(r[0].label).not.toMatch(/h$/);
  });

  it("treats a single point as hourly", () => {
    const r = mapActivity([A(t0, 2, 9)]);
    expect(r).toHaveLength(1);
    expect(r[0].label).toMatch(/h$/);
  });
});

describe("ActivityTimeline (render)", () => {
  it("renders its title with data without throwing", () => {
    const { getByText } = wrap(
      <ActivityTimeline
        activity={[A(t0, 3, 1200), A(t0 + HOUR, 5, 800)]}
      />,
    );
    expect(getByText("Hoạt động theo thời gian")).toBeTruthy();
  });

  it("shows an empty state when there is no activity", () => {
    const { getByText } = wrap(<ActivityTimeline activity={[]} />);
    expect(getByText("Chưa có dữ liệu.")).toBeTruthy();
  });
});
