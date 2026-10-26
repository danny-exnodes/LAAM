import { describe, it, expect } from "vitest";
import {
  nextConvState,
  shouldSubmit,
  passesBargeInGate,
  updateRecentMaxTts,
  BARGE_IN_BASE,
  BARGE_IN_TTS_K,
  RECENT_TTS_WINDOW_MS,
} from "./conversation";

describe("nextConvState", () => {
  it("enable moves off → listening", () => {
    expect(nextConvState("off", "enable")).toBe("listening");
  });

  it("disable returns to off from any state", () => {
    for (const s of ["off", "listening", "thinking", "speaking"] as const) {
      expect(nextConvState(s, "disable")).toBe("off");
    }
  });

  it("transcriptFinal only advances from listening (→ thinking)", () => {
    expect(nextConvState("listening", "transcriptFinal")).toBe("thinking");
    // ignored elsewhere
    expect(nextConvState("speaking", "transcriptFinal")).toBe("speaking");
    expect(nextConvState("thinking", "transcriptFinal")).toBe("thinking");
  });

  it("speakingStarted advances thinking → speaking", () => {
    expect(nextConvState("thinking", "speakingStarted")).toBe("speaking");
  });

  // A turn started by TYPING while hands-free voice is on must follow the same lifecycle
  // as a spoken one — otherwise the machine stays in `listening` with the recognizer open
  // and transcribes Jarvis's own reply back as the next turn.
  it("replyStarted advances listening → thinking (typed message while voice is on)", () => {
    expect(nextConvState("listening", "replyStarted")).toBe("thinking");
  });

  it("replyStarted is ignored outside listening (a spoken turn already left it)", () => {
    expect(nextConvState("thinking", "replyStarted")).toBe("thinking");
    expect(nextConvState("speaking", "replyStarted")).toBe("speaking");
    expect(nextConvState("off", "replyStarted")).toBe("off");
  });

  it("replyEndedNoSpeech returns thinking → listening (nothing to say)", () => {
    expect(nextConvState("thinking", "replyEndedNoSpeech")).toBe("listening");
  });

  it("speakingEnded returns speaking → listening", () => {
    expect(nextConvState("speaking", "speakingEnded")).toBe("listening");
  });

  it("bargeIn only cuts from speaking (→ listening)", () => {
    expect(nextConvState("speaking", "bargeIn")).toBe("listening");
    // ignored elsewhere — a bargeIn signal outside speaking is a no-op
    expect(nextConvState("listening", "bargeIn")).toBe("listening");
    expect(nextConvState("thinking", "bargeIn")).toBe("thinking");
  });

  it("enable is a no-op when already on", () => {
    expect(nextConvState("listening", "enable")).toBe("listening");
  });
});

describe("shouldSubmit", () => {
  it("rejects empty / whitespace-only transcripts", () => {
    expect(shouldSubmit("")).toBe(false);
    expect(shouldSubmit("   ")).toBe(false);
    expect(shouldSubmit("\n\t")).toBe(false);
  });
  it("accepts real text", () => {
    expect(shouldSubmit("xin chào")).toBe(true);
  });
});

describe("passesBargeInGate", () => {
  it("rejects a silent user under loud TTS (echo must not self-interrupt)", () => {
    // mic tracks tts (residual echo) but does not exceed base + k*ttsRef
    const ttsRef = 0.6;
    const echoMic = BARGE_IN_BASE + BARGE_IN_TTS_K * ttsRef - 0.01;
    expect(passesBargeInGate(echoMic, ttsRef)).toBe(false);
  });
  it("accepts real user speech louder than the echo threshold", () => {
    const ttsRef = 0.6;
    const userMic = BARGE_IN_BASE + BARGE_IN_TTS_K * ttsRef + 0.05;
    expect(passesBargeInGate(userMic, ttsRef)).toBe(true);
  });
  it("with no TTS playing, only needs to clear the base floor", () => {
    expect(passesBargeInGate(BARGE_IN_BASE + 0.01, 0)).toBe(true);
    expect(passesBargeInGate(BARGE_IN_BASE - 0.01, 0)).toBe(false);
  });

  // Regression: the real self-interrupts captured live. Against the INSTANTANEOUS tts
  // (already decayed while the delayed echo arrives) these passed; against the recent-max
  // tts (the peak that caused the echo) they must be rejected.
  it("rejects the live echo self-interrupt when compared to the recent-max tts peak", () => {
    // Captured: mic=0.777 arrived as delayed echo of a ~0.74 tts peak, while the
    // instantaneous tts had already decayed to 0.248.
    expect(passesBargeInGate(0.777, 0.248)).toBe(true); // the OLD bug (instantaneous ref)
    expect(passesBargeInGate(0.777, 0.74)).toBe(false); // fixed (recent-max ref)
    // The other captured false fire: mic=0.294, echo of a ~0.5 peak.
    expect(passesBargeInGate(0.294, 0.5)).toBe(false);
  });
  it("still fires a real interruption once TTS has dipped (recent-max low)", () => {
    // Real interruption mic ran 0.15–0.5+. When Jarvis dips between phrases the recent-max
    // falls, dropping the threshold below the user's voice.
    expect(passesBargeInGate(0.3, 0.1)).toBe(true);
  });
});

describe("updateRecentMaxTts", () => {
  it("rises instantly to a new tts peak", () => {
    expect(updateRecentMaxTts(0.1, 0.7, 30)).toBe(0.7);
  });
  it("holds a recent peak through the echo-lag window, then decays to zero", () => {
    // A 0.6 peak must still be well above zero ~150ms later (covers the echo path delay)…
    let v = 0.6;
    for (let t = 0; t < 150; t += 30) v = updateRecentMaxTts(v, 0, 30);
    expect(v).toBeGreaterThan(0.05);
    // …and reach zero once a full window of silence has elapsed.
    for (let t = 0; t < RECENT_TTS_WINDOW_MS; t += 30) v = updateRecentMaxTts(v, 0, 30);
    expect(v).toBe(0);
  });
  it("never goes negative", () => {
    expect(updateRecentMaxTts(0.01, 0, 1000)).toBe(0);
  });
});
