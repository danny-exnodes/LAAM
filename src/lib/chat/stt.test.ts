import { describe, it, expect, vi } from "vitest";
import { createWebSpeechStt } from "./stt";

// Minimal fake SpeechRecognition capturing handlers so tests can drive results.
class FakeRecognition {
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((e: { results: unknown }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
}

function fakeWindow(ctor?: unknown) {
  return { SpeechRecognition: ctor } as unknown as Window & Record<string, unknown>;
}

describe("createWebSpeechStt", () => {
  it("supported() is false when no SpeechRecognition exists", () => {
    const stt = createWebSpeechStt(fakeWindow(undefined));
    expect(stt.supported()).toBe(false);
  });

  it("supported() is true when a constructor exists", () => {
    const stt = createWebSpeechStt(fakeWindow(FakeRecognition));
    expect(stt.supported()).toBe(true);
  });

  it("start() runs recognition and forwards the final transcript", () => {
    const win = fakeWindow(FakeRecognition);
    const stt = createWebSpeechStt(win);
    const onFinal = vi.fn();
    stt.start("vi", onFinal);
    // grab the instance the provider created
    const inst = (stt as unknown as { _rec: FakeRecognition })._rec;
    expect(inst.start).toHaveBeenCalled();
    inst.onresult?.({
      results: [[{ transcript: "xin chào Javis" }]],
    });
    expect(onFinal).toHaveBeenCalledWith("xin chào Javis");
  });

  it("stop() stops the active recognition", () => {
    const win = fakeWindow(FakeRecognition);
    const stt = createWebSpeechStt(win);
    stt.start("vi", vi.fn());
    const inst = (stt as unknown as { _rec: FakeRecognition })._rec;
    stt.stop();
    expect(inst.stop).toHaveBeenCalled();
  });
});
