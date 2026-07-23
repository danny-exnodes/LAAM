import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the VAD so the `enabled` effect never touches a real AudioContext / mic worklet
// (unavailable in jsdom). We only need the barge-in effect to construct without throwing;
// this test targets the no-speech fallback timer, not barge-in.
vi.mock("@ricky0123/vad-web", () => ({
  MicVAD: { new: vi.fn(async () => ({ start: vi.fn(), pause: vi.fn(), destroy: vi.fn() })) },
}));

import { useVoiceConversation } from "./useVoiceConversation";
import type { SttProvider } from "@/lib/chat/stt";

// A mock STT that captures the onFinal callback the hook registers so the test can drive
// the machine listening → thinking by simulating a final transcript.
function makeStt() {
  let onFinal: ((text: string) => void) | null = null;
  const stt: SttProvider = {
    supported: () => true,
    start: vi.fn((_lang, cb: (text: string) => void) => { onFinal = cb; }),
    stop: vi.fn(),
    dispose: vi.fn(),
  };
  return { stt, finalize: (text: string) => onFinal?.(text) };
}

type Props = Parameters<typeof useVoiceConversation>[0];

function baseProps(stt: SttProvider): Props {
  return {
    enabled: true,
    lang: "vi",
    stt,
    sample: () => ({ mic: 0, tts: 0 }),
    isReplying: false,
    isPreparingSpeech: false,
    isSpeaking: false,
    onSubmit: vi.fn(),
    onBargeIn: vi.fn(),
  };
}

// Drive the machine off → listening (enable effect) → thinking (a final transcript).
function toThinking(stt: ReturnType<typeof makeStt>, render: ReturnType<typeof renderHook<{ convState: string }, Props>>) {
  // enable effect already ran on mount → listening; stt.start captured onFinal.
  act(() => { stt.finalize("xin chào"); });
  expect(render.result.current.convState).toBe("thinking");
}

describe("useVoiceConversation — no-speech fallback timing", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("does NOT strand in listening while a TTS attempt is still in flight (isReplying false but isPreparingSpeech true)", () => {
    const s = makeStt();
    const view = renderHook((p: Props) => useVoiceConversation(p), { initialProps: baseProps(s.stt) });
    toThinking(s, view);

    // Reply text streaming, then text finishes but the TTS fetch+prebuffer is still running.
    view.rerender({ ...baseProps(s.stt), isReplying: true, isPreparingSpeech: true });
    view.rerender({ ...baseProps(s.stt), isReplying: false, isPreparingSpeech: true });

    // Past the old 1200ms window: the timer must NOT have armed, because TTS is still busy.
    act(() => { vi.advanceTimersByTime(1500); });
    expect(view.result.current.convState).toBe("thinking");

    // Real audio finally starts → normal transition to speaking (bug would have missed this).
    view.rerender({ ...baseProps(s.stt), isPreparingSpeech: false, isSpeaking: true });
    expect(view.result.current.convState).toBe("speaking");
  });

  it("DOES fall back to listening when reply and TTS attempt both end with no speech", () => {
    const s = makeStt();
    const view = renderHook((p: Props) => useVoiceConversation(p), { initialProps: baseProps(s.stt) });
    toThinking(s, view);

    view.rerender({ ...baseProps(s.stt), isReplying: true, isPreparingSpeech: true });
    // Both go false with no audio (empty reply / no sink / genuine TTS failure).
    view.rerender({ ...baseProps(s.stt), isReplying: false, isPreparingSpeech: false });

    act(() => { vi.advanceTimersByTime(1200); });
    expect(view.result.current.convState).toBe("listening");
  });
});

describe("useVoiceConversation — enable guard cuts TTS in flight", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("calls onBargeIn when enabled while a TTS attempt is still preparing (isSpeaking false, isPreparingSpeech true)", () => {
    // isSpeaking is FALSE during the ~3s neural-TTS prebuffer window even though a TTS
    // attempt is in flight; the guard must consult isPreparingSpeech too, or it opens the
    // recognizer on top of Jarvis's audio (Echo-rule violation). Stable onBargeIn spy so we
    // assert on the exact fn the enable effect closes over after the enabled change.
    const s = makeStt();
    const onBargeIn = vi.fn();
    const props = (over: Partial<Props> = {}): Props => ({ ...baseProps(s.stt), onBargeIn, ...over });

    const view = renderHook((p: Props) => useVoiceConversation(p), {
      initialProps: props({ enabled: false, isSpeaking: false, isPreparingSpeech: true }),
    });
    // Mounted disabled → the enable branch never fires yet.
    expect(onBargeIn).not.toHaveBeenCalled();

    // User clicks "Giọng nói" while the boot greeting is still in its prebuffer window.
    view.rerender(props({ enabled: true, isSpeaking: false, isPreparingSpeech: true }));
    expect(onBargeIn).toHaveBeenCalledTimes(1);
  });
});
