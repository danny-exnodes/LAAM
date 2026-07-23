# Constellation Hands-Free Voice Conversation — Design

**Date:** 2026-07-23
**Status:** Approved (brainstorming) → ready for implementation plan
**Surface:** `/constellation` (Jarvis) voice command-center only. `/chat` is unaffected.

## Problem

`/constellation` already has the pieces for spoken interaction: the "Giọng nói" toggle
starts the mic + audio analyser + `SpeechRecognition`, and replies are spoken via neural
TTS (VieNeu streaming, `speakReply`). But it is **not a conversation** — it is one-shot
voice *input*:

1. **No auto-submit.** A recognized transcript only fills the command input
   (`useVoice({ onTranscript: (txt) => setCommand(...) })`); the user must still press
   "Gửi".
2. **No turn loop.** Recognition is `continuous: false` (one utterance, then it stops) and
   nothing re-opens the mic after Jarvis replies. There is no cycle of
   *listen → submit → think → speak → listen again*.
3. **No barge-in.** While Jarvis is speaking, the user cannot cut in to redirect.

The goal is a ChatGPT-voice-mode-style hands-free loop: enable voice → Jarvis is
conversational — it listens, auto-submits when the user stops talking, speaks the reply,
and re-opens the mic; and if the user talks over Jarvis, it stops and listens.

## Goals

- **Hands-free turn loop.** Enabling voice enters a conversation mode that cycles
  `listening → thinking → speaking → listening` with no clicks per turn.
- **Auto-submit on end-of-speech.** When the user stops talking for a short, tunable
  hangover (~"vài giây"), the utterance is submitted automatically.
- **Barge-in.** Speaking over Jarvis stops the TTS immediately and starts a new listening
  turn (like ChatGPT voice mode).
- **Echo-safe.** Jarvis's own TTS must never be transcribed back as user input.
- **Minimal turn-state cue** via the core ring only (no reinstated waveform/label — the
  user deliberately removed those): `listening` = pale-blue gentle breath, `thinking` =
  blue-white fast (exists), `speaking` = gold (exists).
- **Swappable STT.** STT sits behind a small `SttProvider` interface so a self-hosted
  Whisper backend can replace Web Speech later without touching the turn-taking, VAD, or
  barge-in logic.

## Non-Goals (explicit)

- **No self-hosted STT in v1.** Web Speech (Chrome, Google ASR) is the v1 provider. The
  `SttProvider` seam is built; a `faster-whisper` implementation is **not**.
- **No wake word** ("Hey Jarvis"). The toggle enters/exits conversation mode.
- **No mid-utterance language switching.** Web Speech transcribes in the current UI
  language (`lang`). vi↔en per-sentence code-switching is out of scope (a Web Speech
  limitation; the Whisper seam is the future answer).
- **No custom in-UI silence-timeout slider.** The hangover is a constant, tunable in code.
- **No change** to `/chat`, `/api/chat`, the write-gate/confirm flow, or the neural-TTS
  streaming path (`/api/tts/stream`, `speakReply`, `playPcmStream`).

## Key Insight — why echo is (mostly) solved by structure, not by the STT engine

Web Speech's `SpeechRecognition` opens its **own** mic capture that we cannot apply echo
cancellation to. The naive always-listening design would transcribe Jarvis's own voice and
loop. Two structural facts remove this:

1. **The recognizer only runs while Jarvis is silent.** In the state machine, STT is active
   **only** during `listening`. During `speaking` it is stopped, so it never hears Jarvis.
2. **Barge-in is detected by a VAD on our own AEC'd stream, not by the recognizer.** We take
   a `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })` stream
   and run a real voice-activity detector (Silero via `@ricky0123/vad-web`) on it. With AEC
   removing Jarvis's speaker output from that stream, the VAD sees the user's real voice, so
   barge-in triggers on genuine speech rather than on Jarvis's echo or on raw room energy.

So the STT engine choice is independent of the echo problem. Web Speech is fine for v1.

## Architecture

```
Voice toggle ON
  │
  ▼
useVoiceConversation({ chat, voice(stt), audio, speakReply, enabled, lang })
  │   owns: conversation state machine + VAD wiring + barge-in + turn loop
  │
  ├── VAD (Silero / @ricky0123/vad-web) on getUserMedia(echoCancellation:true)
  │     • speech-start / speech-end (with silence hangover) events
  │     • runs in BOTH listening (→ end-of-turn) and speaking (→ barge-in)
  │
  ├── SttProvider (v1 = WebSpeechStt, wraps existing useVoice recognition)
  │     • active only during `listening`
  │     • yields the final transcript for the turn
  │
  ├── chat.send(...)         (existing) → chat.streaming drives `thinking`
  └── speakReply(fullReply)  (existing) → neural TTS → `speaking`

State machine:
  off ──enable──▶ listening
  listening ──VAD speech-end + transcript──▶ thinking(chat.streaming)
  thinking ──reply done──▶ speaking(speakReply)
  speaking ──TTS ends──▶ listening
  speaking ──VAD speech-start (barge-in)──▶ cut TTS ──▶ listening
  (any) ──disable──▶ off  (tear down: stop STT, stop VAD, cut TTS)
```

### Components

**1. `@/lib/chat/conversation.ts` (new, pure, unit-tested)**
The deterministic core, following the existing `@/lib/chat/voice.ts` pattern (pure module +
thin I/O hook). Contains:
- `ConvState = "off" | "listening" | "thinking" | "speaking"`.
- A pure transition function `nextConvState(state, event)` where events are
  `enable | disable | speechEnd | replyStarted | replyStreaming | replyDone | speaking­Ended | bargeIn`.
- Constants: `SILENCE_HANGOVER_MS` (end-of-turn), `BARGE_IN_MIN_SPEECH_MS` (VAD must report
  sustained speech this long before cutting TTS, to reject blips).
- Guard helpers, e.g. `shouldSubmit(transcript)` (non-empty after trim).

Testable without a browser (no Web Speech / AudioContext / VAD needed for the reducer).

**2. `@/lib/chat/stt.ts` (new) — `SttProvider` interface + `WebSpeechStt`**
```ts
interface SttProvider {
  supported(): boolean;
  start(lang: Lang, onFinal: (text: string) => void): void; // begin transcribing a turn
  stop(): void;                                              // end the turn, flush final
  dispose(): void;
}
```
`WebSpeechStt` wraps the current `SpeechRecognition` usage (extracted from `useVoice`).
A future `WhisperStt` (streams the VAD-captured utterance to a container) implements the
same interface — the only file that changes to swap engines.

**3. `useVoiceConversation` (new hook)**
The I/O shell that wires the pure reducer to the live objects it already receives from
`ConstellationClient` (`chat`, the STT provider, `audio`, `speakReply`). Owns:
- The VAD instance (create on enable, destroy on disable).
- Subscribing VAD `onSpeechStart`/`onSpeechEnd` and routing them through the reducer.
- Starting/stopping the `SttProvider` on entering/leaving `listening`.
- On `speechEnd` in `listening`: harvest transcript → `chat.send` (auto-submit).
- On `bargeIn` in `speaking`: `speakAbortRef.abort()` + `voice.cancelSpeak()` → `listening`.
- After `speakReply` resolves (TTS ended) and still enabled → back to `listening`.
- Exposing the current `ConvState` for the visual cue.

**4. `ConstellationCanvas` visual cue**
Generalize the current `thinking?: boolean` prop to a small mode signal so the ring can show
three eased tints instead of two:
- `listening` → pale blue, gentle breathing (driven by low mic level; distinct from the
  fast blue-white of thinking).
- `thinking` → blue-white, fast swarm (unchanged).
- `speaking` → gold (unchanged).
Keep the eased `thinkFactor`-style interpolation so transitions stay smooth (no hard swap).

**5. `ConstellationClient` wiring**
- Replace the `onTranscript: setCommand` behavior with the conversation hook when voice mode
  is on. Manual typing + "Gửi" continues to work exactly as now (unchanged path).
- The "Giọng nói" toggle now enables/disables conversation mode via the hook.
- Feed the hook's `ConvState` into the canvas mode prop.

## Turn-boundary + barge-in detail

- **End-of-turn (submit):** VAD reports speech, then silence for `SILENCE_HANGOVER_MS` →
  `speechEnd`. On `speechEnd` in `listening`, `SttProvider.stop()` flushes the final
  transcript; if non-empty, auto-submit. VAD (not the browser's own endpointer) owns the
  timing so "vài giây" is tunable.
- **Barge-in:** during `speaking`, VAD `onSpeechStart` sustained ≥ `BARGE_IN_MIN_SPEECH_MS`
  → cut TTS and transition to `listening` (which starts a fresh STT turn). AEC on the VAD
  stream is what makes this fire on the user, not on Jarvis.
- **Two concurrent mic consumers** during `listening` (Web Speech's internal capture + our
  `getUserMedia` for the VAD) is acceptable in browsers; the VAD stream is the AEC'd one.

## Error handling / edge cases

- **STT unsupported** (`WebSpeechStt.supported() === false`, e.g. non-Chrome): conversation
  mode is unavailable; the toggle stays hidden/disabled and text chat + TTS behave as today.
- **VAD load/mic-permission failure:** fail soft — surface a one-line notice, leave voice
  mode off, keep manual chat working. Never hard-crash the page.
- **Recognition error / empty transcript:** stay in `listening`, restart the STT turn with a
  small backoff (avoid a tight error loop). Empty transcript never submits.
- **Disable mid-turn:** tear down in order — stop STT, stop/destroy VAD, `speakAbortRef.abort()`
  + `cancelSpeak()`, release the getUserMedia tracks, state → `off`.
- **Rapid successive turns / barge-in during synthesis:** existing supersede rules hold
  (`speakAbortRef` aborts prior TTS; `chat.send` supersedes the in-flight reply).
- **Unmount:** full teardown (mirror the existing `useVoice` unmount cleanup).

## Testing

- **`conversation.ts`** — unit-test every transition of `nextConvState` (enable/disable from
  each state, speechEnd only submits from `listening`, bargeIn only cuts from `speaking`,
  replyDone → speaking, speakingEnded → listening) and the guards (`shouldSubmit` rejects
  empty/whitespace). This is where the intent lives, so these are the load-bearing tests.
- **`stt.ts`** — test `WebSpeechStt` behind a mocked `SpeechRecognition` (start/stop/final
  callback, supported() gating). The interface is what a future Whisper impl must satisfy.
- **VAD / hook / canvas** — not unit-tested in jsdom (no AudioContext / Web Speech / VAD
  worklet), consistent with the existing `useVoice`/`ConstellationCanvas` approach; verified
  by manual smoke on `/constellation` (Chrome): full loop, auto-submit timing, barge-in with
  speakers and with headphones, disable teardown, non-Chrome fallback.

## Resource notes

- v1 adds **one small dependency** (`@ricky0123/vad-web` + its Silero ONNX model, ~1–2 MB,
  runs in an audio worklet). No new container, no server STT compute — Web Speech's ASR runs
  on Google's servers, so the user's machine stays light (the explicitly requested
  constraint). This does not compete with VieNeu-TTS's CPU budget or Ollama's GPU.

## Open questions

None blocking. Tunables (`SILENCE_HANGOVER_MS`, `BARGE_IN_MIN_SPEECH_MS`, VAD sensitivity)
are set to sensible defaults in code and adjusted during the manual smoke pass.
