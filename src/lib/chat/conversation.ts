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
// exceed base + k*ttsLevel to count as the user talking over Jarvis.
//
// Tuned from a real AEC spike (Task 3 Step 5, run live against actual hardware — see
// CHANGELOG): with echoCancellation on, the idle/echo mic floor stays ~0.02 REGARDLESS
// of how loud tts gets (observed up to tts≈0.7 with mic still ~0.02) — AEC suppresses
// leaked Jarvis audio almost completely, so the original defensive 1:1-ish slope
// (base=0.14, k=0.9) was solving a problem that barely exists on this hardware, while
// making the threshold (e.g. ~0.7 at tts=0.7) far higher than real speech picked up by
// a room mic ever reaches — barge-in essentially never fired. Real speech RMS in the
// same session commonly ran 0.15–0.5+. These values keep >2x margin over the observed
// echo floor at every tts level while staying well under typical real-speech levels.
export const BARGE_IN_BASE = 0.08;
export const BARGE_IN_TTS_K = 0.12;
// Both barge-in gates must hold NET this long before TTS is cut (rejects blips).
export const BARGE_IN_MIN_SPEECH_MS = 250;
// Barge-in uses a leaky-bucket accumulator, not a plain streak timer: a passing frame
// (~30ms) ADDS to an accrued "good" duration, capped at BARGE_IN_MIN_SPEECH_MS; a
// failing frame DRAINS it at this multiple of the frame time. Two live-hardware findings
// drove this:
//  1. A hard reset on ANY single failing frame meant real speech (whose RMS envelope
//     dips between syllables, and whose VAD segments a continuous interruption into
//     multiple onSpeechStart/onSpeechEnd phrase spans) almost never accumulated an
//     unbroken streak — observed max ~190ms, barge-in never fired.
//  2. The opposite fix (tolerate any gap under N ms between passes, à la a pure
//     "streak survives small gaps" timer) went too far the other way: it anchors the
//     250ms timer to the FIRST pass and then tolerates an unlimited run of near-misses
//     afterward, so one loud blip (echo, a cough, a consonant) could coast a self-
//     interrupt through mostly-silent frames — observed firing with mic≈0.018 (the
//     idle floor) because an earlier single frame had passed.
// Draining faster than accrual (>1) means net loudness must be SUSTAINED, not merely
// "recently touched once" — isolated spikes bleed back to 0 within a single failing
// frame (any rate ≥1 already does that, since pass/fail frames are the same duration),
// while genuine speech (mostly passing, brief dips) keeps net-accruing. 1.5 needs a
// ~60% pass rate to net-accrue — meaningfully selective without demanding an
// unrealistically clean signal from a room mic.
export const BARGE_IN_DECAY_RATE = 1.5;

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
