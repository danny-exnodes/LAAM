import { afterEach, describe, expect, it, vi } from "vitest";
import {
  publish,
  subscribe,
  subscriberCount,
  unsubscribe,
} from "./events-bus";

// The bus is a process singleton, so each test cleans up its own subscribers
// to avoid leaking across the suite.
afterEach(() => {
  // no global reset exposed by design; tests unsubscribe what they add.
});

describe("events-bus", () => {
  it("delivers a published event to a subscriber", () => {
    // This is the contract the SSE route relies on: a publish from the data
    // layer must reach the stream's write callback.
    const cb = vi.fn();
    const off = subscribe(cb);
    publish({ type: "sessions", sessions: [] });
    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith({ type: "sessions", sessions: [] });
    off();
  });

  it("delivers to every current subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribe(a);
    const offB = subscribe(b);
    publish({ type: "ping" });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    offA();
    offB();
  });

  it("stops delivering after unsubscribe", () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    off();
    publish({ type: "sessions" });
    expect(cb).not.toHaveBeenCalled();
  });

  it("supports the explicit unsubscribe(cb) form", () => {
    const cb = vi.fn();
    subscribe(cb);
    unsubscribe(cb);
    publish({ type: "sessions" });
    expect(cb).not.toHaveBeenCalled();
  });

  it("isolates a throwing subscriber from the rest of the fan-out", () => {
    // A closed SSE stream throws on write; that must not block other clients.
    const boom = vi.fn(() => {
      throw new Error("stream closed");
    });
    const ok = vi.fn();
    const offBoom = subscribe(boom);
    const offOk = subscribe(ok);
    expect(() => publish({ type: "sessions" })).not.toThrow();
    expect(ok).toHaveBeenCalledOnce();
    offBoom();
    offOk();
  });

  it("tracks subscriber count", () => {
    const base = subscriberCount();
    const off = subscribe(() => {});
    expect(subscriberCount()).toBe(base + 1);
    off();
    expect(subscriberCount()).toBe(base);
  });
});
