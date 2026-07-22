import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAudioAnalyser } from "./useAudioAnalyser";

// Minimal AudioContext mock: enough surface for attachTts's graph wiring.
// createMediaElementSource is the call under test (must be idempotent per element —
// the real WebAudio API throws InvalidStateError on a second call for the same
// <audio> element, and Chromium has been observed leaking previously-created
// MediaElementAudioSourceNode graphs even after .disconnect(), so the fix is to
// never call it more than once for the same long-lived element in the first place).
function mockAudioContext() {
  const createMediaElementSource = vi.fn((_el: unknown) => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  const createAnalyser = vi.fn(() => ({
    fftSize: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteTimeDomainData: vi.fn(),
  }));
  const ctx = {
    state: "running",
    resume: vi.fn(),
    close: vi.fn(),
    destination: {},
    createMediaElementSource,
    createAnalyser,
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
  };
  return { ctx, createMediaElementSource };
}

describe("useAudioAnalyser.attachTts", () => {
  let restoreAudioContext: () => void;
  beforeEach(() => {
    const { ctx } = mockAudioContext();
    const original = (window as unknown as { AudioContext?: unknown }).AudioContext;
    // Must be `new`-able (arrow functions can't be constructors).
    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(function AudioContextMock() {
      return ctx;
    });
    restoreAudioContext = () => {
      (window as unknown as { AudioContext: unknown }).AudioContext = original;
    };
  });

  it("wires the audio graph once per element, not once per chunk (repeat calls with the SAME element are a no-op)", () => {
    const { result } = renderHook(() => useAudioAnalyser());
    const el = {} as HTMLAudioElement;

    act(() => {
      result.current.attachTts(el);
      result.current.attachTts(el); // simulates a second TTS chunk reusing the same <audio> element
      result.current.attachTts(el); // and a third
    });

    // window.AudioContext is a fresh mock per test; grab the instance actually used.
    const ctxInstance = (window as unknown as { AudioContext: ReturnType<typeof vi.fn> }).AudioContext.mock.results[0].value;
    expect(ctxInstance.createMediaElementSource).toHaveBeenCalledTimes(1);
    restoreAudioContext();
  });

  it("re-wires the graph when attaching a genuinely different element", () => {
    const { result } = renderHook(() => useAudioAnalyser());
    const elA = {} as HTMLAudioElement;
    const elB = {} as HTMLAudioElement;

    act(() => {
      result.current.attachTts(elA);
      result.current.attachTts(elB);
    });

    const ctxInstance = (window as unknown as { AudioContext: ReturnType<typeof vi.fn> }).AudioContext.mock.results[0].value;
    expect(ctxInstance.createMediaElementSource).toHaveBeenCalledTimes(2);
    restoreAudioContext();
  });
});
