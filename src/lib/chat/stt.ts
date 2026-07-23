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
