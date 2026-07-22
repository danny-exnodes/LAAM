import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAudioAnalyser } from "./useAudioAnalyser";

function mockAudioContext() {
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
    createAnalyser,
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
  };
  return { ctx };
}

describe("useAudioAnalyser.getTtsSink", () => {
  let original: unknown;
  beforeEach(() => {
    const { ctx } = mockAudioContext();
    original = (window as unknown as { AudioContext?: unknown }).AudioContext;
    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(function AudioContextMock() {
      return ctx;
    });
  });
  afterEach(() => {
    (window as unknown as { AudioContext: unknown }).AudioContext = original;
  });

  it("returns a context and a persistent analyser, creating the analyser only once", () => {
    const { result } = renderHook(() => useAudioAnalyser());
    const a = result.current.getTtsSink();
    const b = result.current.getTtsSink();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.analyser).toBe(b!.analyser); // same analyser reused, not rebuilt per call
    const ctxInstance = (window as unknown as { AudioContext: ReturnType<typeof vi.fn> }).AudioContext.mock.results[0].value;
    expect(ctxInstance.createAnalyser).toHaveBeenCalledTimes(1);
  });

  it("wires the TTS analyser to the context destination", () => {
    const { result } = renderHook(() => useAudioAnalyser());
    const sink = result.current.getTtsSink();
    const ctxInstance = (window as unknown as { AudioContext: ReturnType<typeof vi.fn> }).AudioContext.mock.results[0].value;
    const analyser = ctxInstance.createAnalyser.mock.results[0].value;
    expect(analyser.connect).toHaveBeenCalledWith(ctxInstance.destination);
    expect(sink!.analyser).toBe(analyser);
  });
});
