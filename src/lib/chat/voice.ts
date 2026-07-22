/**
 * voice.ts — PURE (no React, no top-level window access → SSR-safe).
 *
 * Deterministic core for the chat voice command-center. The browser Web Speech
 * API (SpeechRecognition / SpeechSynthesis) is feature-detected at runtime and
 * wired by client hooks; this module only holds the testable, framework-free bits:
 *   - speechSupport(win): which capabilities a given window object exposes.
 *   - langToBcp47(lang): map LAAM's i18n codes → valid BCP-47 tags. Rule 13:
 *     the recognition/utterance `lang` MUST be a real BCP-47 tag, mapped in code,
 *     never derived from model output or the raw "vi"/"en"/"zh" cookie value.
 *   - stripForSpeech(md): reduce markdown to prose so TTS reads words, not syntax.
 */
import type { Lang } from "@/i18n/types";

// Minimal shape of the bits of `window` we feature-detect (keeps the fn pure +
// callable with a stub object in tests, no real DOM needed).
export type SpeechWindowLike = {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  speechSynthesis?: unknown;
};

export type SpeechSupport = { recognition: boolean; synthesis: boolean };

export function speechSupport(win: SpeechWindowLike | undefined | null): SpeechSupport {
  if (!win) return { recognition: false, synthesis: false };
  return {
    recognition: typeof win.SpeechRecognition !== "undefined" || typeof win.webkitSpeechRecognition !== "undefined",
    synthesis: typeof win.speechSynthesis !== "undefined",
  };
}

const BCP47: Record<Lang, string> = { vi: "vi-VN", en: "en-US", zh: "zh-CN" };

export function langToBcp47(lang: Lang): string {
  return BCP47[lang] ?? "en-US";
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 1;
}

// GFM separator row: only `-`, `:`, `|`, and whitespace between the pipes (e.g. "|---|:--:|").
function isTableSeparator(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|$/.test(line.trim());
}

function splitTableCells(line: string): string[] {
  const t = line.trim();
  return t.slice(1, -1).split("|").map((c) => c.trim());
}

/**
 * tablesToProse — a GFM table reads as a wall of "|" and dashes over TTS ("pipe C4K
 * Staging pipe 428a3084 dash 43da..."). Turn each data row into a short spoken sentence
 * ("Tên project: C4K Staging. Trạng thái: active."), one row per group, so voice mode
 * hears prose instead of table syntax. Runs BEFORE stripForSpeech's other regexes so any
 * markdown left inside a cell (e.g. **bold**) still gets cleaned up afterward.
 */
function tablesToProse(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableCells(lines[i]);
      const sentences: string[] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && !isTableSeparator(lines[j])) {
        const cells = splitTableCells(lines[j]);
        const parts = headers
          .map((h, k) => (h && cells[k] ? `${h}: ${cells[k]}` : ""))
          .filter(Boolean);
        if (parts.length) sentences.push(parts.join(". ") + ".");
        j++;
      }
      out.push(sentences.join(" "));
      i = j;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join("\n");
}

/**
 * stripForSpeech — turn a markdown assistant reply into plain prose for TTS:
 * convert GFM tables into spoken sentences, drop fenced code blocks, inline code,
 * image/link syntax (keep link text), heading/list/emphasis markers, and collapse
 * whitespace.
 */
export function stripForSpeech(md: string): string {
  return tablesToProse(md)
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s*[-*+]\s+/gm, "") // bullet markers
    .replace(/[*_~>]/g, "") // emphasis / blockquote marks
    .replace(/\s+/g, " ")
    .trim();
}

// Neural TTS (/api/tts) synthesizes on CPU, so a reply is split into short
// chunks played back to back (see speakChunks). Small chunks serve three ends:
// the pipeline stays gapless (the next chunk finishes synthesizing before the
// current one stops playing), the first word is heard sooner (a ~60-char chunk
// synthesizes in ~1-2s of prose), and no single request runs long.
//
// Budget by CHARACTERS but sized for the worst-case CONTENT, not average prose:
// character count badly underestimates synthesis cost for dense tokens. A UUID
// (e.g. "428a3084-43da-4edb-8656-4005a3b19825") is read out digit-by-digit, so
// a 94-char chunk containing one measured ~9.8s to synthesize — that is exactly
// what pushed a table of project IDs past the upstream timeout and made the page
// fall back to the robotic browser voice. A 60-char chunk holds at most one
// UUID and the worst such chunk measures ~5-7s, comfortably inside the (raised)
// route timeout; plain prose chunks synthesize in ~2-3s.
const TTS_CHUNK_MAX_CHARS = 60;

export function chunkForSpeech(text: string, maxChars = TTS_CHUNK_MAX_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const chunks: string[] = [];
  let current = "";

  // Each chunk synthesizes as an INDEPENDENT TTS request with no cross-chunk prosody, so an
  // arbitrary nearest-space cut can orphan a short word right before a comma at the boundary
  // (e.g. "...M&A, Cảng" | "Định An v3..." splits "Cảng" from "Định An v3") — the neural TTS
  // backend then drops or garbles that isolated word ("đọc mất chữ"). Prefer cutting at a
  // comma/semicolon near the budget so a list item stays together; fall back to the nearest
  // space when no such break exists, or when the comma is too close to the start (which would
  // leave a near-empty lead chunk — a wasted synth round-trip for one or two words).
  const pushWordWrapped = (piece: string) => {
    let rest = piece;
    while (rest.length > maxChars) {
      const window = rest.slice(0, maxChars + 1);
      let cut = window.lastIndexOf(",");
      if (cut <= 0) cut = window.lastIndexOf(";");
      if (cut > maxChars * 0.3) {
        cut += 1; // keep the comma with the preceding clause
      } else {
        cut = rest.lastIndexOf(" ", maxChars);
        if (cut <= 0) cut = maxChars;
      }
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    current = rest;
  };

  const sentences = trimmed.match(/[^.!?]+[.!?]*\s*/g) ?? [trimmed];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const joined = current ? `${current} ${sentence}` : sentence;
    if (joined.length <= maxChars) {
      current = joined;
    } else {
      if (current) chunks.push(current);
      pushWordWrapped(sentence);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export interface SpeakChunksDeps {
  /** Synthesize one chunk → a playable object URL, or null on failure. */
  synth: (text: string) => Promise<string | null>;
  /** Play a URL to completion → true if it played, false on playback error. */
  play: (url: string) => Promise<boolean>;
  /** Speak the remaining text via the browser fallback when neural TTS fails. */
  fallback: (text: string) => void;
  /** Release a synthesized object URL (defaults to a no-op, e.g. in tests). */
  revoke?: (url: string) => void;
}

/**
 * speakChunks — play a chunked reply through neural TTS with no gaps.
 *
 * Naive "synthesize a chunk, play it, synthesize the next, play it" leaves a
 * multi-second silence before every chunk while the next is synthesized on the
 * CPU TTS service (the reported "khựng lại" stutter). Here a producer
 * synthesizes chunks strictly in order — one request at a time, so the CPU
 * service never serves two syntheses at once — running AHEAD of a consumer that
 * plays them back to back. Because synthesis (~4-5s/chunk) is faster than
 * playback (~8-11s/chunk), the next chunk is already synthesized by the time
 * the current one ends, so audio is continuous after the first chunk.
 *
 * On any synthesis or playback failure, the remaining text (from the failing
 * chunk onward) is handed to `fallback` in a single call, and any
 * synthesized-but-unplayed URLs are revoked so nothing leaks.
 */
export async function speakChunks(chunks: readonly string[], deps: SpeakChunksDeps): Promise<void> {
  const { synth, play, fallback, revoke = () => {} } = deps;
  const n = chunks.length;
  if (n === 0) return;

  const slots = Array.from({ length: n }, () => defer<string | null>());
  let cancelled = false;

  // Producer: synthesize every chunk in order, one request at a time.
  const producer = (async () => {
    for (let i = 0; i < n; i++) {
      if (cancelled) {
        slots[i].resolve(null);
        continue;
      }
      try {
        slots[i].resolve(await synth(chunks[i]));
      } catch {
        slots[i].resolve(null);
      }
    }
  })();

  // Consumer: play each chunk as soon as its synthesis is ready.
  let consumed = 0;
  try {
    for (; consumed < n; consumed++) {
      const url = await slots[consumed].promise;
      if (url === null) {
        if (!cancelled) fallback(chunks.slice(consumed).join(" "));
        return;
      }
      let played = false;
      try {
        played = await play(url);
      } catch {
        played = false;
      }
      revoke(url);
      if (!played) {
        fallback(chunks.slice(consumed).join(" "));
        return;
      }
    }
  } finally {
    cancelled = true;
    await producer.catch(() => {});
    // Revoke synthesized-but-unplayed chunks (those after where playback
    // stopped) so their object URLs don't leak.
    for (let j = consumed + 1; j < n; j++) {
      void slots[j].promise.then((u) => {
        if (u) revoke(u);
      }, () => {});
    }
  }
}
