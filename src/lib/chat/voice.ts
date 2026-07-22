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

