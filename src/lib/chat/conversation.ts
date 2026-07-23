// Pure conversation-mode logic for the /constellation hands-free voice loop.
// No browser APIs — this is the deterministic core (mirrors the pure @/lib/chat/voice
// module) so every transition and guard is unit-testable without jsdom.

export type ConvState = "off" | "listening" | "thinking" | "speaking";

export type ConvEvent =
  | "enable" // user turned voice mode on
  | "disable" // user turned voice mode off (or teardown)
  | "transcriptFinal" // STT produced a non-empty final transcript for the turn
  | "speakingStarted" // neural TTS actually began playing the reply
  | "speakingEnded" // TTS finished
  | "replyEndedNoSpeech" // the reply finished but produced nothing to speak
  | "bargeIn"; // user spoke over Jarvis (both barge-in gates held)

// Barge-in Gate B threshold: the mic RMS (already smoothed by useAudioAnalyser) must
// exceed base + k*ttsLevel to count as the user talking over Jarvis. Because residual
// echo scales with ttsLevel, this bar rises exactly when Jarvis is loud, so leaked audio
// can't clear it — only the user's real, louder voice can. Starting values; tuned during
// the smoke pass against the AEC spike numbers from Task 3.
export const BARGE_IN_BASE = 0.14;
export const BARGE_IN_TTS_K = 0.9;
// Both barge-in gates must hold at least this long before TTS is cut (rejects blips).
export const BARGE_IN_MIN_SPEECH_MS = 250;

export function nextConvState(state: ConvState, event: ConvEvent): ConvState {
  if (event === "disable") return "off";
  switch (state) {
    case "off":
      return event === "enable" ? "listening" : "off";
    case "listening":
      return event === "transcriptFinal" ? "thinking" : "listening";
    case "thinking":
      if (event === "speakingStarted") return "speaking";
      if (event === "replyEndedNoSpeech") return "listening";
      return "thinking";
    case "speaking":
      if (event === "speakingEnded" || event === "bargeIn") return "listening";
      return "speaking";
    default:
      return state;
  }
}

export function shouldSubmit(transcript: string): boolean {
  return transcript.trim().length > 0;
}

export function passesBargeInGate(mic: number, tts: number): boolean {
  return mic > BARGE_IN_BASE + BARGE_IN_TTS_K * tts;
}
