# Constellation Hands-Free Voice Conversation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/constellation` "Giọng nói" toggle into a ChatGPT-style hands-free voice conversation: listen → auto-submit on end-of-speech → Jarvis speaks → listen again, with barge-in that cuts Jarvis off when the user talks over him.

**Architecture:** A pure state machine + guards (`conversation.ts`) drives four states (off/listening/thinking/speaking). A thin orchestration hook (`useVoiceConversation`) wires that machine to the existing chat, TTS (`speakReply`), audio analyser, a swappable `SttProvider` (Web Speech in v1), and a Silero VAD (`@ricky0123/vad-web`). Barge-in fires only when TWO gates hold — Silero speech-onset AND a mic level above a TTS-referenced dynamic threshold — so Jarvis's own audio never interrupts him. The core ring shows the turn via colour (listening = red-white, thinking = blue-white, speaking = gold).

**Tech Stack:** Next.js 16 / React 19 / TypeScript (strict), Vitest, Web Speech API (`SpeechRecognition`), Web Audio API, `@ricky0123/vad-web` (Silero VAD, v0.0.29).

## Global Constraints

- **Surface:** `/constellation` only. Do NOT touch `/chat`, `/api/chat`, the write-gate/confirm flow, or the neural-TTS streaming path (`/api/tts/stream`, `speakReply`, `playPcmStream`).
- **STT is swappable:** all STT access goes through the `SttProvider` interface; v1 provides `WebSpeechStt` only. No self-hosted Whisper in v1.
- **Reuse the existing mic where the analyser is concerned:** `useAudioAnalyser`'s `getUserMedia` gains AEC constraints; its `sample()` supplies the `mic`/`tts` levels for barge-in Gate B. (Silero's `MicVAD` manages its own AEC'd capture — documented API — rather than sharing a node.)
- **Echo rule:** the recognizer runs ONLY during `listening` (Jarvis silent); barge-in during `speaking` uses the VAD + the TTS-referenced threshold, never the recognizer.
- **Pure logic is unit-tested; browser I/O (hook, canvas, VAD, Web Speech) is verified by manual smoke on Chrome** — jsdom has no AudioContext/Web Speech/VAD worklet. This mirrors the existing `useVoice`/`ConstellationCanvas` approach.
- **Conventions:** TypeScript strict, no `any` in app code, immutable updates, small focused files, `feat:`/`test:` conventional commits.
- **i18n:** any new user-facing string gets keys in all three `i18n.*` locales (vi/en/zh).

---

## File Structure

- **Create** `src/lib/chat/conversation.ts` — pure state machine (`nextConvState`), guards (`shouldSubmit`, `passesBargeInGate`), constants. No browser deps.
- **Create** `src/lib/chat/conversation.test.ts` — unit tests for the above.
- **Create** `src/lib/chat/stt.ts` — `SttProvider` interface + `createWebSpeechStt()`.
- **Create** `src/lib/chat/stt.test.ts` — unit tests with a mocked `SpeechRecognition`.
- **Modify** `src/components/constellation/useAudioAnalyser.ts` — add AEC constraints to `getUserMedia`.
- **Create** `src/components/constellation/useVoiceConversation.ts` — orchestration hook (VAD + STT + machine).
- **Modify** `src/components/constellation/ConstellationCanvas.tsx` — replace `thinking?: boolean` with `mode` (idle/listening/thinking/speaking); add red-white listening tint.
- **Modify** `src/components/constellation/ConstellationClient.tsx` — instantiate the STT provider + hook, feed `mode` to the canvas, keep manual typing intact.
- **Modify** `package.json` — add `@ricky0123/vad-web`.

---

## Task 1: Conversation state machine + guards (pure)

**Files:**
- Create: `src/lib/chat/conversation.ts`
- Test: `src/lib/chat/conversation.test.ts`

**Interfaces:**
- Produces:
  - `type ConvState = "off" | "listening" | "thinking" | "speaking"`
  - `type ConvEvent = "enable" | "disable" | "transcriptFinal" | "speakingStarted" | "speakingEnded" | "replyEndedNoSpeech" | "bargeIn"`
  - `nextConvState(state: ConvState, event: ConvEvent): ConvState`
  - `shouldSubmit(transcript: string): boolean`
  - `passesBargeInGate(mic: number, tts: number): boolean`
  - Constants `BARGE_IN_BASE: number`, `BARGE_IN_TTS_K: number`, `BARGE_IN_MIN_SPEECH_MS: number`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/chat/conversation.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/chat/conversation.test.ts`
Expected: FAIL — `Cannot find module './conversation'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/chat/conversation.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/chat/conversation.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/conversation.ts src/lib/chat/conversation.test.ts
git commit -m "feat(constellation): pure conversation state machine + barge-in gate"
```

---

## Task 2: Swappable STT provider (Web Speech)

**Files:**
- Create: `src/lib/chat/stt.ts`
- Test: `src/lib/chat/stt.test.ts`

**Interfaces:**
- Consumes: `langToBcp47` from `@/lib/chat/voice`; `Lang` from `@/i18n/types`.
- Produces:
  - `interface SttProvider { supported(): boolean; start(lang: Lang, onFinal: (text: string) => void): void; stop(): void; dispose(): void; }`
  - `createWebSpeechStt(win?: Window & Record<string, unknown>): SttProvider`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/chat/stt.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/chat/stt.test.ts`
Expected: FAIL — `Cannot find module './stt'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/chat/stt.ts`:

```ts
// Speech-to-text behind a small swappable interface. v1 provides WebSpeechStt (Chrome
// Web Speech API). A future WhisperStt (stream VAD-captured audio to a self-hosted
// container) implements the SAME interface — the only file that changes to swap engines.
// The `_rec` field is exposed for unit tests to drive the fake recognizer.

import type { Lang } from "@/i18n/types";
import { langToBcp47 } from "@/lib/chat/voice";

export interface SttProvider {
  /** True when the runtime can transcribe (e.g. Chrome). Callers hide voice mode if false. */
  supported(): boolean;
  /** Begin transcribing one turn; onFinal fires once with the utterance's final text. */
  start(lang: Lang, onFinal: (text: string) => void): void;
  /** End the current turn (flushes the final result via the browser's own endpointing). */
  stop(): void;
  /** Release everything (call on teardown/unmount). */
  dispose(): void;
}

type RecognitionResult = ArrayLike<ArrayLike<{ transcript: string }>>;
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: RecognitionResult }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecogCtor = new () => SpeechRecognitionLike;

function getWin(): (Window & Record<string, unknown>) | undefined {
  return typeof window !== "undefined"
    ? (window as unknown as Window & Record<string, unknown>)
    : undefined;
}

export function createWebSpeechStt(win = getWin()): SttProvider {
  const ctor = () =>
    (win?.SpeechRecognition ?? win?.webkitSpeechRecognition) as RecogCtor | undefined;
  let rec: SpeechRecognitionLike | null = null;

  const provider: SttProvider & { _rec?: SpeechRecognitionLike | null } = {
    supported() {
      return !!ctor();
    },
    start(lang, onFinal) {
      const Ctor = ctor();
      if (!Ctor) return;
      try {
        rec?.stop();
      } catch {
        /* no active session */
      }
      const r = new Ctor();
      r.lang = langToBcp47(lang);
      r.interimResults = false;
      r.continuous = false; // one utterance; the browser's endpointing ends the turn
      r.onresult = (e) => {
        const text = Array.from(e.results, (x) => x[0]?.transcript ?? "")
          .join(" ")
          .trim();
        if (text) onFinal(text);
      };
      r.onend = () => {
        /* turn ended; the hook decides whether to start the next one */
      };
      r.onerror = () => {
        /* swallowed; the hook restarts listening with backoff */
      };
      rec = r;
      provider._rec = r;
      try {
        r.start();
      } catch {
        /* start races are non-fatal */
      }
    },
    stop() {
      try {
        rec?.stop();
      } catch {
        /* already stopped */
      }
    },
    dispose() {
      try {
        rec?.stop();
      } catch {
        /* already stopped */
      }
      rec = null;
      provider._rec = null;
    },
  };
  return provider;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/chat/stt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/stt.ts src/lib/chat/stt.test.ts
git commit -m "feat(constellation): swappable SttProvider with Web Speech implementation"
```

---

## Task 3: AEC on the analyser mic + measure the echo (de-risk)

**Files:**
- Modify: `src/components/constellation/useAudioAnalyser.ts:31-42` (the `startMic` `getUserMedia` call)
- Test: `src/components/constellation/useAudioAnalyser.test.ts` (existing — must still pass)

**Interfaces:**
- Produces: no signature change. `sample()` still returns `{ mic, tts }`; `mic` is now measured on an echo-cancelled stream.

This task also runs the **AEC spike** the spec requires FIRST: with echo cancellation on, confirm the mic stays quiet while Jarvis speaks. The numbers set `BARGE_IN_BASE`/`BARGE_IN_TTS_K`.

- [ ] **Step 1: Add AEC constraints to the mic capture**

In `src/components/constellation/useAudioAnalyser.ts`, change the `getUserMedia` call inside `startMic` from:

```ts
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
```

to:

```ts
      // Echo cancellation is load-bearing for barge-in: it removes Jarvis's own TTS
      // (played through ctx.destination) from the mic so the VAD + barge-in gate react
      // to the user, not to Jarvis. noiseSuppression/autoGainControl + mono match the
      // constraints Silero's MicVAD uses, keeping both mic consumers consistent.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
```

- [ ] **Step 2: Run the existing analyser tests**

Run: `npx vitest run src/components/constellation/useAudioAnalyser.test.ts`
Expected: PASS — the tests mock `getUserMedia` and don't assert the constraint object; if any test asserts `{ audio: true }` exactly, update that assertion to the new object.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i useAudioAnalyser`
Expected: no output.

- [ ] **Step 4: Commit the AEC change**

```bash
git add src/components/constellation/useAudioAnalyser.ts src/components/constellation/useAudioAnalyser.test.ts
git commit -m "feat(constellation): echo-cancel the analyser mic capture for barge-in"
```

- [ ] **Step 5: Run the AEC spike (manual, browser) and record numbers**

Temporarily add, inside `ConstellationClient`'s `getLevel` callback (or a throwaway `setInterval`), a log of `sample()` while a reply plays and you stay SILENT:

```ts
// TEMP spike log — remove before Task 6. Run in Chrome with speakers at normal volume.
console.log("AEC spike", JSON.stringify(sample()));
```

Run the app (`npm run dev` on :3100), enable voice, ask something, and while Jarvis speaks and you say nothing, watch the console:
- **If `mic` stays low (≈0.06–0.15) while `tts` is high (>0.3):** AEC works; the defaults `BARGE_IN_BASE=0.14`, `BARGE_IN_TTS_K=0.9` are fine.
- **If `mic` tracks `tts` upward:** AEC is weak here; note the ratio `mic/tts` while silent and set `BARGE_IN_TTS_K` a bit ABOVE it (so silent-user echo never crosses) and raise `BARGE_IN_BASE` above the idle mic floor. Edit the constants in `src/lib/chat/conversation.ts`.

Remove the TEMP log afterward. Record the observed numbers in the commit body if you retuned:

```bash
# only if you changed the constants:
git add src/lib/chat/conversation.ts
git commit -m "chore(constellation): tune barge-in thresholds from AEC spike measurements"
```

Expected outcome: a decision recorded — AEC sufficient (defaults kept) or thresholds retuned. Barge-in is not "done" until Task 6's smoke shows no self-interruption on speakers at normal volume.

---

## Task 4: The conversation orchestration hook

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/components/constellation/useVoiceConversation.ts`

**Interfaces:**
- Consumes:
  - `nextConvState`, `shouldSubmit`, `passesBargeInGate`, `BARGE_IN_MIN_SPEECH_MS` from `@/lib/chat/conversation`.
  - `SttProvider` from `@/lib/chat/stt`.
  - `MicVAD` from `@ricky0123/vad-web`.
  - `Lang` from `@/i18n/types`.
- Produces:
  - ```ts
    useVoiceConversation(opts: {
      enabled: boolean;
      lang: Lang;
      stt: SttProvider;
      sample: () => { mic: number; tts: number };
      isReplying: boolean;   // chat.streaming
      isSpeaking: boolean;   // neuralSpeaking || voice.speaking
      onSubmit: (text: string) => void; // fire chat.send with this text
      onBargeIn: () => void;            // abort neural TTS + cancelSpeak
    }): { convState: ConvState }
    ```

- [ ] **Step 1: Install the VAD library**

Run: `npm install @ricky0123/vad-web@^0.0.29`
Expected: `package.json` + `package-lock.json` updated.

- [ ] **Step 2: Type-check that the import resolves**

Run: `node -e "require.resolve('@ricky0123/vad-web'); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Write the hook**

Create `src/components/constellation/useVoiceConversation.ts`:

```ts
"use client";
// Orchestrates the hands-free voice loop: it is the I/O shell around the pure state
// machine in @/lib/chat/conversation. It owns the STT turn lifecycle and the Silero
// VAD (barge-in only), and advances the machine from observable signals (STT final,
// TTS start/stop, VAD onset). All load-bearing decisions live in the tested pure module.
//
// Not unit-tested in jsdom (no AudioContext / Web Speech / VAD worklet) — verified by the
// manual smoke pass in the plan, consistent with useVoice/ConstellationCanvas.

import { useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import type { Lang } from "@/i18n/types";
import type { SttProvider } from "@/lib/chat/stt";
import {
  nextConvState,
  shouldSubmit,
  passesBargeInGate,
  BARGE_IN_MIN_SPEECH_MS,
  type ConvState,
} from "@/lib/chat/conversation";

interface Opts {
  enabled: boolean;
  lang: Lang;
  stt: SttProvider;
  sample: () => { mic: number; tts: number };
  isReplying: boolean;
  isSpeaking: boolean;
  onSubmit: (text: string) => void;
  onBargeIn: () => void;
}

export function useVoiceConversation(opts: Opts): { convState: ConvState } {
  const [convState, setConvState] = useState<ConvState>("off");

  // Mirror everything the async callbacks need through refs so the effect wiring never
  // closes over stale values (same pattern as ConstellationClient's other callbacks).
  const stateRef = useRef<ConvState>("off");
  stateRef.current = convState;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Central dispatch: run the pure reducer, then perform the side effects that the NEW
  // state requires (start/stop STT). Everything funnels through here so the machine and
  // the I/O never disagree.
  const dispatch = useRef((event: Parameters<typeof nextConvState>[1]) => {
    const prev = stateRef.current;
    const next = nextConvState(prev, event);
    if (next === prev) return;
    stateRef.current = next;
    setConvState(next);

    const { stt, lang } = optsRef.current;
    // Entering listening → open a fresh STT turn. Leaving listening → close it.
    if (next === "listening") {
      stt.start(lang, (text) => {
        if (stateRef.current === "listening" && shouldSubmit(text)) {
          optsRef.current.onSubmit(text);
          dispatch.current("transcriptFinal");
        } else if (stateRef.current === "listening") {
          // empty result — reopen the mic for another try (backoff avoids a tight loop)
          setTimeout(() => {
            if (stateRef.current === "listening") stt.start(lang, () => {});
          }, 300);
        }
      });
    } else if (prev === "listening") {
      stt.stop();
    }
  });

  // Enable / disable.
  useEffect(() => {
    if (opts.enabled && stateRef.current === "off") dispatch.current("enable");
    if (!opts.enabled && stateRef.current !== "off") dispatch.current("disable");
  }, [opts.enabled]);

  // Observe TTS start/stop → drive thinking→speaking→listening.
  const prevSpeaking = useRef(false);
  useEffect(() => {
    const was = prevSpeaking.current;
    prevSpeaking.current = opts.isSpeaking;
    if (!was && opts.isSpeaking) dispatch.current("speakingStarted");
    if (was && !opts.isSpeaking) dispatch.current("speakingEnded");
  }, [opts.isSpeaking]);

  // A reply that finishes streaming but never starts speaking (empty/failed TTS) must not
  // strand us in `thinking`. When streaming ends while still thinking, give speech a beat;
  // if it hasn't started, fall back to listening.
  const prevReplying = useRef(false);
  useEffect(() => {
    const was = prevReplying.current;
    prevReplying.current = opts.isReplying;
    if (was && !opts.isReplying && stateRef.current === "thinking") {
      const t = setTimeout(() => {
        if (stateRef.current === "thinking" && !optsRef.current.isSpeaking) {
          dispatch.current("replyEndedNoSpeech");
        }
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [opts.isReplying]);

  // VAD lifecycle: create once when enabled, destroy on disable/unmount. Barge-in only.
  const vadRef = useRef<MicVAD | null>(null);
  useEffect(() => {
    if (!opts.enabled) return;
    let disposed = false;
    let sustainedSince = 0;

    void MicVAD.new({
      // Silero fires onSpeechStart at speech onset. We confirm barge-in with Gate B
      // (mic loud relative to current TTS) sustained for BARGE_IN_MIN_SPEECH_MS, so
      // Jarvis's own leaked audio never cuts him off. Only acts during `speaking`.
      onSpeechStart: () => {
        if (stateRef.current !== "speaking") return;
        const { mic, tts } = optsRef.current.sample();
        if (!passesBargeInGate(mic, tts)) return;
        sustainedSince = performance.now();
      },
      onFrameProcessed: () => {
        if (stateRef.current !== "speaking") {
          sustainedSince = 0;
          return;
        }
        const { mic, tts } = optsRef.current.sample();
        if (!passesBargeInGate(mic, tts)) {
          sustainedSince = 0;
          return;
        }
        if (sustainedSince === 0) sustainedSince = performance.now();
        if (performance.now() - sustainedSince >= BARGE_IN_MIN_SPEECH_MS) {
          sustainedSince = 0;
          optsRef.current.onBargeIn();
          dispatch.current("bargeIn");
        }
      },
    })
      .then((vad) => {
        if (disposed) {
          vad.destroy();
          return;
        }
        vadRef.current = vad;
        vad.start();
      })
      .catch(() => {
        /* VAD load/mic failure → fail soft; barge-in unavailable, loop still works */
      });

    return () => {
      disposed = true;
      try {
        vadRef.current?.destroy();
      } catch {
        /* already gone */
      }
      vadRef.current = null;
    };
  }, [opts.enabled]);

  // Teardown STT when the machine leaves the conversation entirely.
  useEffect(() => {
    if (convState === "off") optsRef.current.stt.stop();
  }, [convState]);

  return { convState };
}
```

> Note on `onFrameProcessed`: `@ricky0123/vad-web`'s `MicVAD` exposes a per-frame callback; it is used here to poll Gate B for the sustained-duration check. If the installed version names it differently, use its per-frame hook (the library processes ~30ms frames). The barge-in decision itself is the tested `passesBargeInGate`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i useVoiceConversation`
Expected: no output (if `onFrameProcessed` is not in the lib's types, switch to the version's per-frame callback name and re-run).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/constellation/useVoiceConversation.ts
git commit -m "feat(constellation): voice-conversation orchestration hook (VAD + STT + machine)"
```

---

## Task 5: Core-ring turn tint (listening = red-white)

**Files:**
- Modify: `src/components/constellation/ConstellationCanvas.tsx`

**Interfaces:**
- Consumes: a new `mode` prop.
- Produces: `ConstellationCanvas` prop change — replace `thinking?: boolean` with `mode?: "idle" | "listening" | "thinking" | "speaking"`.

- [ ] **Step 1: Change the prop and thread a mode ref**

In `src/components/constellation/ConstellationCanvas.tsx`, replace the prop:

```ts
export function ConstellationCanvas({
  placed,
  getLevel,
  thinking = false,
}: {
  placed: Placed[];
  getLevel: () => number;
  thinking?: boolean;
}) {
```

with:

```ts
export function ConstellationCanvas({
  placed,
  getLevel,
  mode = "idle",
}: {
  placed: Placed[];
  getLevel: () => number;
  /** Turn state → ring tint. listening = red-white, thinking = blue-white, speaking/idle
   * = gold. Eased so transitions between tints stay smooth (no hard swap). */
  mode?: "idle" | "listening" | "thinking" | "speaking";
}) {
```

Then replace the existing `thinking` ref lines:

```ts
  // Mirror thinking through a ref for the same reason
  const thinkingRef = useRef(thinking);
  thinkingRef.current = thinking;
```

with:

```ts
  // Mirror mode through a ref so the rAF loop never closes over a stale prop.
  const modeRef = useRef(mode);
  modeRef.current = mode;
```

- [ ] **Step 2: Ease two factors (thinking + listening) instead of one**

Replace the single eased factor line:

```ts
    // Eased 0→1 factor toward the current `thinking` target ...
    let thinkFactor = 0;
```

with:

```ts
    // Eased 0→1 factors toward the current mode's tint. Two factors (thinking blue-white,
    // listening red-white) ease independently so any transition between the three tints
    // is smooth rather than a jump-cut. speaking/idle = neither factor = gold.
    let thinkFactor = 0;
    let listenFactor = 0;
```

In `frame()`, replace the single ease line:

```ts
      thinkFactor += ((thinkingRef.current ? 1 : 0) - thinkFactor) * 0.08;
```

with:

```ts
      const m = modeRef.current;
      thinkFactor += ((m === "thinking" ? 1 : 0) - thinkFactor) * 0.08;
      listenFactor += ((m === "listening" ? 1 : 0) - listenFactor) * 0.08;
```

- [ ] **Step 3: Swarm speed follows thinking only (unchanged feel)**

The swarm currently speeds up with `thinkFactor`. Leave that keyed to `thinkFactor` (listening stays calm). No change needed to the `rot`/`wobAmp` lines beyond that they already read `thinkFactor`.

- [ ] **Step 4: Interpolate the ring/ripple tint across THREE targets**

Replace the current gold↔blue interpolation block:

```ts
      const gR = 255, gG = 206, gB = 122; // gold
      const tR = 180, tG = 232, tB = 255; // thinking blue-white
      const ringR = Math.round(gR + (tR - gR) * thinkFactor);
      const ringG = Math.round(gG + (tG - gG) * thinkFactor);
      const ringB = Math.round(gB + (tB - gB) * thinkFactor);
      const ringRGB = `${ringR},${ringG},${ringB}`;
      const ringGlow = `rgb(${ringRGB})`;
```

with:

```ts
      // Base gold, then blend toward thinking (blue-white) and listening (red-white) by
      // their eased factors. They're mutually exclusive in practice (one mode at a time),
      // so the factor not active is ~0 and doesn't muddy the colour.
      const gR = 255, gG = 206, gB = 122; // gold (idle / speaking)
      const tR = 180, tG = 232, tB = 255; // thinking blue-white
      const lR = 255, lG = 120, lB = 130; // listening warm red-white (coral, harmonizes w/ gold)
      const ringR = Math.round(gR + (tR - gR) * thinkFactor + (lR - gR) * listenFactor);
      const ringG = Math.round(gG + (tG - gG) * thinkFactor + (lG - gG) * listenFactor);
      const ringB = Math.round(gB + (tB - gB) * thinkFactor + (lB - gB) * listenFactor);
      const ringRGB = `${ringR},${ringG},${ringB}`;
      const ringGlow = `rgb(${ringRGB})`;
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i ConstellationCanvas`
Expected: no output (the one call site in ConstellationClient still passes `thinking` — that's fixed in Task 6; if you type-check before Task 6 the client will show a prop error, which is expected and resolved there).

- [ ] **Step 6: Commit**

```bash
git add src/components/constellation/ConstellationCanvas.tsx
git commit -m "feat(constellation): three-way ring tint with red-white listening state"
```

---

## Task 6: Wire the hook into ConstellationClient + full smoke

**Files:**
- Modify: `src/components/constellation/ConstellationClient.tsx`

**Interfaces:**
- Consumes: `useVoiceConversation` (Task 4), `createWebSpeechStt` (Task 2), the `mode` prop (Task 5).

- [ ] **Step 1: Import the new pieces**

Near the other imports in `ConstellationClient.tsx`, add:

```ts
import { createWebSpeechStt } from "@/lib/chat/stt";
import { useVoiceConversation } from "./useVoiceConversation";
```

- [ ] **Step 2: Create the STT provider once**

After the `voice` hook is set up (around the `useVoice({...})` call), add:

```ts
  // STT provider for hands-free conversation. Created once; swap createWebSpeechStt for a
  // future createWhisperStt without touching the conversation hook.
  const sttRef = useRef(createWebSpeechStt());
```

- [ ] **Step 3: Extract a submit-by-text path**

`handleSend` currently reads `command`. Add a text-driven submit the voice hook can call, reusing the existing supersede/reset logic. Right after `handleSend`, add:

```ts
  // Submit an arbitrary utterance (voice turn) through the same path as manual send,
  // including the "cut Jarvis off before a new turn" behavior.
  const submitText = useCallback(
    (msg: string) => {
      const text = msg.trim();
      if (!text) return;
      speakAbortRef.current?.abort();
      voice.cancelSpeak();
      setCaption("");
      fullReplyRef.current = "";
      void chat.send({
        message: text,
        ...(model ? { model } : {}),
        customAgentId: selectedAgentId,
        ...(requestedTool ? { requestedTool } : {}),
      });
    },
    [chat, model, selectedAgentId, requestedTool, voice],
  );
```

- [ ] **Step 4: Instantiate the conversation hook**

After `submitText`, add:

```ts
  const { convState } = useVoiceConversation({
    enabled: voiceEnabled,
    lang,
    stt: sttRef.current,
    sample,
    isReplying: chat.streaming,
    isSpeaking: speaking, // voice.speaking || neuralSpeaking (already derived above)
    onSubmit: submitText,
    onBargeIn: () => {
      speakAbortRef.current?.abort();
      voice.cancelSpeak();
    },
  });
```

- [ ] **Step 5: Stop routing voice transcripts into the text box**

The old one-shot behavior fed transcripts into the command input. In conversation mode the hook owns STT, so change the `useVoice` transcript wiring to only fill the box when NOT in hands-free mode. Update the `useVoice({...})` call's `onTranscript`:

```ts
  const voice = useVoice({
    lang,
    onTranscript: (txt) => {
      // In hands-free mode the conversation hook drives STT; don't also fill the box.
      if (voiceEnabledRef.current) return;
      setCommand((p) => (p ? `${p} ${txt}` : txt));
    },
  });
```

> `voiceEnabledRef` already exists in this file. Also: `toggleVoice` currently calls `voice.startListening()` — remove that line (and `voice.stopListening()` in the disable branch) so the conversation hook is the sole STT driver in voice mode; keep the `audio.ensure()/startMic()/stopMic()` calls (the analyser + AEC mic are still needed).

- [ ] **Step 6: Compute the canvas mode and pass it**

Replace the canvas usage:

```tsx
      <ConstellationCanvas placed={placed} getLevel={getLevel} thinking={chat.streaming} />
```

with:

```tsx
      <ConstellationCanvas placed={placed} getLevel={getLevel} mode={canvasMode} />
```

and, just before the `return (`, derive `canvasMode` (voice state wins when on; otherwise preserve today's behavior):

```ts
  // Ring tint source: in hands-free mode the conversation state drives it; otherwise fall
  // back to the manual-typing behavior (thinking while streaming, else idle/speaking gold).
  const canvasMode: "idle" | "listening" | "thinking" | "speaking" =
    convState !== "off"
      ? convState
      : chat.streaming
        ? "thinking"
        : "idle";
```

- [ ] **Step 7: Make the ring breathe with the mic while listening**

Because Step 5 removed `voice.startListening()`, `voice.listening` is no longer true during a
conversation turn, so `getLevel` would return the flat idle level and the red ring wouldn't
react to the user's voice. Bridge it with a ref (declared BEFORE `getLevel`, assigned after
the hook, so ordering is fine).

Near the top of the component (before `getLevel` is defined), add:

```ts
  const convStateRef = useRef<"idle" | "listening" | "thinking" | "speaking" | "off">("off");
```

Immediately after the `useVoiceConversation({...})` call, add:

```ts
  convStateRef.current = convState;
```

In `getLevel`, add a listening branch at the top of the body (right after `const { mic, tts } = sample();`):

```ts
    if (convStateRef.current === "listening") return Math.max(0.06, mic);
```

This gives the red listening ring a gentle mic-reactive breath without reintroducing the old
recognizer. (`getLevel`'s dependency array does not need `convState` — it reads the ref.)

- [ ] **Step 9: Type-check the whole app**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "Constellation|conversation|stt"`
Expected: no output.

- [ ] **Step 10: Run the full unit suite**

Run: `npx vitest run src/lib/chat/conversation.test.ts src/lib/chat/stt.test.ts src/components/constellation/`
Expected: all PASS.

- [ ] **Step 11: Manual smoke (Chrome, `npm run dev` on :3100)**

Verify each, on speakers at normal volume AND once with headphones:
- Enable "Giọng nói" → ring turns **red-white** (listening).
- Say a question, stop → within ~1–2s it auto-submits (no click); ring turns **blue-white** (thinking), then **gold** while Jarvis speaks.
- Jarvis finishes → ring returns to **red-white**, mic is live again (next turn needs no click).
- While Jarvis speaks, talk over him → he stops within ~250ms and the ring goes **red-white**; your new utterance is captured. Confirm he does NOT interrupt himself when you stay silent (the Task-3 thresholds hold).
- Disable "Giọng nói" mid-turn → everything stops (no lingering mic/TTS), ring back to gold/idle.
- Manual typing + "Gửi" still works with voice OFF, exactly as before.
- Non-Chrome (or `sttRef.current.supported() === false`): voice mode simply does nothing harmful; text chat + TTS behave as today.

Remove any leftover TEMP spike log from Task 3.

- [ ] **Step 12: Commit**

```bash
git add src/components/constellation/ConstellationClient.tsx
git commit -m "feat(constellation): wire hands-free voice conversation into the command center"
```

---

## Task 7: Docs + changelog

**Files:**
- Modify: `CHANGELOG.md` (under `[Unreleased]`)
- Modify: `README.md` (constellation/voice section, Vietnamese)

- [ ] **Step 1: Changelog entry**

Add under `[Unreleased]` in `CHANGELOG.md` (Vietnamese, matching the file's style):

```markdown
### Đã thêm — Constellation: chế độ hội thoại voice rảnh tay (Jarvis)
- `/constellation` nay có chế độ nói chuyện liên tục: bật "Giọng nói" là vào vòng lặp nghe → tự gửi khi ngừng nói → Jarvis đọc trả lời → tự nghe lượt tiếp, không cần bấm. Nói chen khi Jarvis đang đọc sẽ ngắt Jarvis ngay (barge-in kiểu ChatGPT), chống tự-ngắt bằng 2 cổng (Silero VAD + ngưỡng động theo mức TTS). STT qua `SttProvider` có thể thay bằng Whisper self-host sau. Vòng tròn lõi báo lượt bằng màu: nghe = đỏ-trắng, xử lý = xanh-trắng, nói = vàng.
```

- [ ] **Step 2: README note**

Add a short line in the voice/constellation section of `README.md` describing hands-free mode + the Chrome/Web-Speech requirement for v1.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs(constellation): note hands-free voice conversation mode"
```

---

## Self-Review notes (coverage vs spec)

- **Turn loop / auto-submit / re-listen** → Tasks 1 (machine), 4 (hook), 6 (wiring).
- **Barge-in with two gates (Silero + TTS-referenced threshold)** → Task 1 (`passesBargeInGate`), Task 4 (VAD + gate wiring), Task 3 (AEC + threshold tuning).
- **Echo-safe (recognizer only while Jarvis silent)** → Task 4 (STT started only on entering `listening`; VAD/gate handle `speaking`).
- **Swappable STT** → Task 2 (`SttProvider` + `WebSpeechStt`).
- **Reuse existing mic (add AEC)** → Task 3.
- **Ring tint: listening red-white / thinking blue-white / speaking gold** → Task 5, mode derived in Task 6.
- **Error handling / teardown / non-Chrome fallback** → Task 4 (fail-soft VAD, empty-transcript backoff, disable teardown), Task 6 (supported()-gated, manual path unchanged).
- **Testing: pure logic unit-tested, browser via smoke** → Tasks 1–2 unit tests; Task 6 smoke.
- **Resource light (one small dep, no container)** → Task 4 (only `@ricky0123/vad-web`).

Deviation from spec, intentional: the reducer events are `speakingStarted/speakingEnded/replyEndedNoSpeech` (observable TTS signals) rather than the spec's `replyDone`, because the client already drives `speakReply` off the `chat.streaming` transition — the hook observes speech start/stop instead of re-deriving reply-done. Barge-in constant `SILENCE_HANGOVER_MS` from the spec is omitted (YAGNI): end-of-turn rides Web Speech endpointing in v1; add it only if the smoke pass shows the browser default is too eager.
