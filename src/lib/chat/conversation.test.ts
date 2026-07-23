import { describe, it, expect } from "vitest";
import {
  nextConvState,
  shouldSubmit,
  passesBargeInGate,
  BARGE_IN_BASE,
  BARGE_IN_TTS_K,
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
    // mic tracks tts (residual echo) but does not exceed base + k*tts
    const tts = 0.6;
    const echoMic = BARGE_IN_BASE + BARGE_IN_TTS_K * tts - 0.01;
    expect(passesBargeInGate(echoMic, tts)).toBe(false);
  });
  it("accepts real user speech louder than the echo threshold", () => {
    const tts = 0.6;
    const userMic = BARGE_IN_BASE + BARGE_IN_TTS_K * tts + 0.05;
    expect(passesBargeInGate(userMic, tts)).toBe(true);
  });
  it("with no TTS playing, only needs to clear the base floor", () => {
    expect(passesBargeInGate(BARGE_IN_BASE + 0.01, 0)).toBe(true);
    expect(passesBargeInGate(BARGE_IN_BASE - 0.01, 0)).toBe(false);
  });
});
