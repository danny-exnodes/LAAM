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
// exceed base + k*ttsRef to count as the user talking over Jarvis — where `ttsRef` is the
// RECENT-MAX tts (see updateRecentMaxTts), NOT the instantaneous tts.
//
// Why recent-max, and why k jumped back up to ~1.2: the speaker→air→mic echo path is
// DELAYED. The leaked echo arriving in the mic at time T reflects the TTS that played
// ~100–200ms EARLIER. A live self-interrupt was captured firing at mic=0.777 while the
// *instantaneous* tts read only 0.248 — because that 0.777 was the delayed echo of a TTS
// PEAK (~0.74) from ~150ms before, by which point the instantaneous tts had already
// decayed. Comparing mic against the instantaneous tts therefore fundamentally can't
// reject echo (the reference is misaligned in time); comparing against the recent-max
// tts (which still holds that 0.74 peak) can. With that alignment fixed, the coupling k
// can be the real echo leak ratio (observed worst case mic/peak ≈ 1.05 during an AEC
// re-convergence transient), so base + k*ttsRef sits ABOVE the leaked echo at every
// moment — echo can no longer cross it, which is what makes speaker-mode self-interrupts
// impossible by construction (the "never tự ngắt trên loa" goal) without any separate
// speaker-vs-headphone detection. The unavoidable cost of rejecting echo this way: while
// Jarvis is loud, a real interruption's mic (~0.15–0.5) also sits under base+k*ttsRef, so
// barge-in accrues credit mainly as Jarvis's TTS dips between phrases (ttsRef falls, the
// threshold drops, the user's voice clears it). On headphones there is no echo so this is
// strictly safe; barge-in there simply waits for the same natural dips.
export const BARGE_IN_BASE = 0.1;
export const BARGE_IN_TTS_K = 1.2;
// Recent-max tts window: the mic-vs-tts comparison uses the MAX tts over roughly this
// window, so a still-arriving echo is measured against the TTS peak that actually caused
// it (~100–200ms earlier). Long enough to cover the echo path delay, short enough that a
// genuine Jarvis pause lets the reference fall so a real interruption can register.
export const RECENT_TTS_WINDOW_MS = 300;
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

// Gate B: is the mic louder than the leaked echo of `ttsRef` could account for? Pass the
// RECENT-MAX tts (updateRecentMaxTts) as `ttsRef`, not the instantaneous tts, so a still-
// arriving echo is compared to the TTS peak that caused it rather than a value that has
// already decayed (the time-misalignment that let echo self-interrupt — see the constants
// above).
export function passesBargeInGate(mic: number, ttsRef: number): boolean {
  return mic > BARGE_IN_BASE + BARGE_IN_TTS_K * ttsRef;
}

// Decaying max of the tts level over RECENT_TTS_WINDOW_MS: a new tts sample instantly
// raises it; otherwise it decays linearly, reaching 0 from a peak of 1.0 after one full
// window. Keeps the barge-in gate referencing the recent TTS PEAK (which the currently-
// arriving echo reflects), not the instantaneous — possibly-already-dropped — tts.
export function updateRecentMaxTts(prev: number, tts: number, dtMs: number): number {
  const decayed = Math.max(0, prev - dtMs / RECENT_TTS_WINDOW_MS);
  return Math.max(decayed, tts);
}
