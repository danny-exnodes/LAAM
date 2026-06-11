import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { NotificationBell, badgeLabel, relTime } from "./notification-bell";
import { notificationsDict } from "@/i18n/dictionaries/notifications";
import { resolve } from "@/i18n/index";

// EventSource stub — bell opens its own stream for live badge updates. We only need
// it not to throw; the live-update path is covered by the events route test (S2/F2).
class FakeES {
  url: string;
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(type: string, cb: (e: unknown) => void) {
    (this.listeners[type] ||= []).push(cb);
  }
  close() {}
}

const t = (k: string, v?: Record<string, string | number>) => resolve(notificationsDict, "vi", k, v);

function ui() {
  return render(
    <I18nProvider lang="vi">
      <NotificationBell />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeES as unknown as typeof EventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("badgeLabel (pure)", () => {
  test("hidden at 0, exact below 10, capped 9+ above", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(-1)).toBeNull();
    expect(badgeLabel(3)).toBe("3");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
    expect(badgeLabel(150)).toBe("9+");
  });
});

describe("relTime (pure)", () => {
  test("buckets to now / minutes / hours / days", () => {
    const now = 10_000_000_000;
    expect(relTime(new Date(now).toISOString(), t, now)).toBe(t("notif.now"));
    expect(relTime(new Date(now - 5 * 60_000).toISOString(), t, now)).toBe(t("notif.minutesAgo", { n: 5 }));
    expect(relTime(new Date(now - 3 * 3_600_000).toISOString(), t, now)).toBe(t("notif.hoursAgo", { n: 3 }));
    expect(relTime(new Date(now - 2 * 86_400_000).toISOString(), t, now)).toBe(t("notif.daysAgo", { n: 2 }));
  });
});

describe("NotificationBell", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "n1",
    type: "workflow_run",
    severity: "error",
    title: "Workflow thất bại",
    body: null,
    link: "/workflows/wf1?run=r1",
    source: "workflow",
    readAt: null,
    createdAt: new Date().toISOString(),
    ...over,
  });

  test("renders the unread badge from the initial fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ notifications: [row()], unread: 1 }),
      })),
    );
    ui();
    await waitFor(() => expect(screen.getByTestId("notif-badge").textContent).toBe("1"));
  });

  test("opening the dropdown lists the notifications", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ notifications: [row({ title: "Workflow thất bại" })], unread: 1 }),
      })),
    );
    ui();
    await waitFor(() => screen.getByTestId("notif-badge"));
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("Workflow thất bại")).toBeTruthy();
  });

  test("mark-all-read clears the badge and POSTs read-all", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/notifications?")) {
        return { ok: true, json: async () => ({ notifications: [row()], unread: 1 }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    ui();
    await waitFor(() => screen.getByTestId("notif-badge"));
    fireEvent.click(screen.getByRole("button", { expanded: false })); // open
    fireEvent.click(screen.getByText(t("notif.markAllRead")));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/notifications/read-all", { method: "POST" }),
    );
    // Badge gone once unread hits 0.
    await waitFor(() => expect(screen.queryByTestId("notif-badge")).toBeNull());
  });

  test("empty state shows when there are no notifications", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ notifications: [], unread: 0 }) })),
    );
    ui();
    // No badge when unread=0.
    await waitFor(() => expect(screen.queryByTestId("notif-badge")).toBeNull());
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText(t("notif.empty"))).toBeTruthy();
  });
});
