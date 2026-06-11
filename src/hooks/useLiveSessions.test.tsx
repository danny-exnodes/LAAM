import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveSessions, type LiveSession } from "./useLiveSessions";

// --- Mock EventSource -------------------------------------------------------
// Captures listeners so tests can drive `sessions` events + open/error.
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  listeners = new Map<string, ((e: MessageEvent) => void)[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (e: MessageEvent) => void) {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }
  close() {
    this.closed = true;
  }
  // test helpers
  emitSessions(sessions: Partial<LiveSession>[]) {
    const data = JSON.stringify({ type: "sessions", sessions });
    for (const cb of this.listeners.get("sessions") ?? [])
      cb({ data } as MessageEvent);
  }
}

const NOW = 1_700_000_000_000;
const MIN = 60 * 1000;

function session(over: Partial<LiveSession>): Partial<LiveSession> {
  return {
    id: "s1",
    status: "running",
    lastActivity: NOW,
    model: "claude-opus",
    ...over,
  };
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  // Default: /api/config unreachable → the hook must fall back to 10 minutes.
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  vi.setSystemTime(NOW);
});

// Point the fetch stub at a working /api/config returning the given threshold.
function stubConfig(stuckMin: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ stuckMin }) })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useLiveSessions", () => {
  it("opens /api/events and exposes pushed sessions", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLiveSessions());
    const es = MockEventSource.instances[0];
    expect(es.url).toBe("/api/events");

    act(() => {
      es.onopen?.();
      es.emitSessions([session({ id: "a" }), session({ id: "b" })]);
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.sessions.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("computes stuckIds from isStuck (running + stale)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLiveSessions());
    const es = MockEventSource.instances[0];

    act(() => {
      es.emitSessions([
        session({ id: "fresh", lastActivity: NOW - 1 * MIN }),
        session({ id: "stuck", lastActivity: NOW - 20 * MIN }),
        session({ id: "done-old", status: "done", lastActivity: NOW - 99 * MIN }),
      ]);
    });

    expect(result.current.stuckIds).toEqual(["stuck"]);
  });

  it("fires a Notification once per newly-stuck session when permission granted", () => {
    vi.useFakeTimers();
    const notifSpy = vi.fn();
    class FakeNotification {
      static permission = "granted";
      constructor(title: string, opts?: NotificationOptions) {
        notifSpy(title, opts);
      }
    }
    vi.stubGlobal("Notification", FakeNotification);

    const { result } = renderHook(() => useLiveSessions());
    const es = MockEventSource.instances[0];

    act(() => {
      es.emitSessions([session({ id: "stuck", lastActivity: NOW - 20 * MIN })]);
    });
    expect(notifSpy).toHaveBeenCalledTimes(1);
    expect(result.current.stuckIds).toEqual(["stuck"]);

    // Same session still stuck on the next push → no duplicate notification.
    act(() => {
      es.emitSessions([session({ id: "stuck", lastActivity: NOW - 21 * MIN })]);
    });
    expect(notifSpy).toHaveBeenCalledTimes(1);
  });

  it("does not notify when permission is not granted", () => {
    vi.useFakeTimers();
    const notifSpy = vi.fn();
    class FakeNotification {
      static permission = "default";
      constructor() {
        notifSpy();
      }
    }
    vi.stubGlobal("Notification", FakeNotification);

    renderHook(() => useLiveSessions());
    const es = MockEventSource.instances[0];
    act(() => {
      es.emitSessions([session({ id: "stuck", lastActivity: NOW - 20 * MIN })]);
    });
    expect(notifSpy).not.toHaveBeenCalled();
  });

  it("sets connected=false on error", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLiveSessions());
    const es = MockEventSource.instances[0];
    act(() => {
      es.onopen?.();
    });
    expect(result.current.connected).toBe(true);
    act(() => {
      es.onerror?.();
    });
    expect(result.current.connected).toBe(false);
  });

  it("closes the EventSource on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useLiveSessions());
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });

  // /api/config (LAAM_STUCK_MIN) drives the threshold — deployments can tune
  // it without a rebuild, so the hook must not hardcode 10.
  it("uses the stuckMin from /api/config instead of the hardcoded default", async () => {
    vi.useFakeTimers();
    stubConfig(30);
    const { result } = renderHook(() => useLiveSessions());
    const es = MockEventSource.instances[0];

    await act(async () => {}); // flush the config fetch

    act(() => {
      es.emitSessions([
        session({ id: "20min", lastActivity: NOW - 20 * MIN }), // stuck under 10', NOT under 30'
        session({ id: "40min", lastActivity: NOW - 40 * MIN }),
      ]);
    });

    expect(result.current.stuckIds).toEqual(["40min"]);
  });

  it("re-evaluates already-received sessions when /api/config answers late", async () => {
    vi.useFakeTimers();
    stubConfig(30);
    const { result } = renderHook(() => useLiveSessions());
    const es = MockEventSource.instances[0];

    // Sessions arrive BEFORE the config answer → judged with the default (10').
    act(() => {
      es.emitSessions([session({ id: "20min", lastActivity: NOW - 20 * MIN })]);
    });
    expect(result.current.stuckIds).toEqual(["20min"]);

    // Config answer (30') lands → the same session is no longer stuck.
    await act(async () => {});
    expect(result.current.stuckIds).toEqual([]);
  });

  it("falls back to the 10-minute default when /api/config fails", async () => {
    vi.useFakeTimers();
    // beforeEach default fetch stub rejects.
    const { result } = renderHook(() => useLiveSessions());
    const es = MockEventSource.instances[0];

    await act(async () => {});

    act(() => {
      es.emitSessions([session({ id: "20min", lastActivity: NOW - 20 * MIN })]);
    });
    expect(result.current.stuckIds).toEqual(["20min"]);
  });
});
