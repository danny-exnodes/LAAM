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
import type { ViewDescriptor } from "@/lib/agent/view";

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

// Phần dọn markdown dùng CHUNG cho stripForSpeech và extractForSpeech — hai hàm chỉ
// khác nhau ở chỗ bảng đi đâu (đọc thành văn xuôi vs. đẩy sang panel). Tách ra để
// chúng không trôi khác nhau theo thời gian.
function cleanProse(md: string): string {
  return md
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

/**
 * stripForSpeech — turn a markdown assistant reply into plain prose for TTS:
 * convert GFM tables into spoken sentences, drop fenced code blocks, inline code,
 * image/link syntax (keep link text), heading/list/emphasis markers, and collapse
 * whitespace.
 */
export function stripForSpeech(md: string): string {
  return cleanProse(tablesToProse(md));
}

// Blank/duplicate header text ("| | Store |" hoặc hai cột cùng tên) không được phép
// làm object-key trùng nhau — trùng key nghĩa là ô sau ghi đè ô trước, mất dữ liệu
// âm thầm. Key nội bộ được làm duy nhất bằng hậu tố chỉ số; LABEL hiển thị vẫn giữ
// nguyên văn bản gốc (kể cả rỗng/trùng) để bảng trên panel đúng như model viết.
function uniqueHeaderKeys(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    const count = seen.get(h) ?? 0;
    seen.set(h, count + 1);
    return h === "" || count > 0 ? `${h}__${i}` : h;
  });
}

// Chỉ nhận bảng GFM ĐÚNG cú pháp (có dòng separator). Bảng hỏng rơi xuống
// tablesToProse ở cuối hàm — nội dung vẫn được đọc, chỉ không lên panel.
function tableToDescriptor(headers: string[], dataRows: string[][]): ViewDescriptor | null {
  if (!headers.length || !dataRows.length) return null;
  const keys = uniqueHeaderKeys(headers);
  const rows = dataRows.map((cells) =>
    Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? ""])),
  );
  const numeric = (key: string) =>
    rows.every((r) => r[key] !== "" && !Number.isNaN(Number(String(r[key]).replace(/[,\s]/g, ""))));
  return {
    kind: "table",
    title: headers.join(" · "),
    source: { type: "model" },
    columns: keys.map((k, i) => ({ key: k, label: headers[i], align: numeric(k) ? "right" : "left" })),
    rows,
  };
}

const CHART_FENCE = /```chart\s*([\s\S]*?)```/g;

function chartToDescriptor(body: string): ViewDescriptor | null {
  try {
    const parsed = JSON.parse(body) as { type?: string; title?: string };
    if (!parsed || typeof parsed !== "object") return null;
    return {
      kind: "chart",
      title: typeof parsed.title === "string" ? parsed.title : "",
      source: { type: "model" },
      rows: [{ raw: body.trim() }], // ChartBlock nhận nguyên chuỗi JSON
    };
  } catch {
    return null; // JSON hỏng → không dựng panel; cleanProse sẽ nuốt block như code fence
  }
}

// "| PH-005 | 1015 |" → "PH-005, 1015". Chạy SAU tablesToProse nên chỉ còn lại những
// dòng-bảng lạc không thành bảng hợp lệ. Giữ nội dung, bỏ cú pháp — im lặng nuốt cả
// dòng sẽ làm user mất dữ liệu mà không biết.
function strayTableRowsToProse(md: string): string {
  return md.replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_m, inner: string) =>
    inner.split("|").map((c) => c.trim()).filter(Boolean).join(", "),
  );
}

/**
 * extractForSpeech — tách phần NHÌN được (bảng GFM, block ```chart) ra khỏi câu trả
 * lời, trả về lời nói đã sạch cú pháp + danh sách descriptor cho panel.
 *
 * WHY: VOICE_GUIDE bảo model đừng xuất markdown và model phớt lờ (đã sửa prompt 2 lần,
 * xem checkpoint 2026-07-22 / 2026-08-03). Cắt bằng code là thứ chắc chắn (Rule 5).
 *
 * KHÁC stripForSpeech: hàm đó BIẾN bảng thành văn xuôi để đọc; hàm này BỎ bảng khỏi
 * lời nói vì nó sẽ hiện trên panel. Client nào không có panel phải dùng stripForSpeech.
 */
export function extractForSpeech(md: string): { speech: string; descriptors: ViewDescriptor[] } {
  const descriptors: ViewDescriptor[] = [];

  // 1) chart fences — JSON hỏng thì GIỮ NGUYÊN văn bản khớp (kể cả dấu ```), để nó
  //    chảy xuống cleanProse's fenced-code-block regex và bị nuốt ở ĐÓ như comment của
  //    chartToDescriptor mô tả, thay vì biến mất ở đây mà không qua fallback nào.
  let rest = md.replace(CHART_FENCE, (m, body: string) => {
    const d = chartToDescriptor(body);
    if (d) {
      descriptors.push(d);
      return "\n";
    }
    return m;
  });

  // 2) bảng GFM đúng cú pháp
  const lines = rest.split("\n");
  const kept: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableCells(lines[i]);
      const dataRows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && !isTableSeparator(lines[j])) {
        dataRows.push(splitTableCells(lines[j]));
        j++;
      }
      const d = tableToDescriptor(headers, dataRows);
      if (d) {
        descriptors.push(d);
        i = j;
        continue; // bảng đã lên panel → bỏ khỏi lời nói
      }
    }
    kept.push(lines[i]);
    i++;
  }
  rest = kept.join("\n");

  // 3) dòng-bảng lạc (bảng thiếu separator, model viết hỏng) vẫn phải đọc được.
  //    cleanProse KHÔNG đụng tới ký tự "|" — đây là lỗ có sẵn của stripForSpeech, và ta
  //    chỉ vá ở đường mới này, không đụng stripForSpeech (v2 đang dùng).
  return { speech: cleanProse(strayTableRowsToProse(tablesToProse(rest))), descriptors };
}

// A long reply streamed through /tts/stream in ONE request can take far longer to
// synthesize than any sane upstream timeout (measured: 3651 chars of real VieNeu-CPU
// output took 149s to generate 266s of audio, vs. the route's 60s cap) — the connection
// gets killed mid-speech. 280 chars is comfortably short at VieNeu's measured ~41ms/char
// generation rate (~11.5s worst case per segment), so splitForSpeech's segments each
// finish streaming well inside any reasonable timeout.
export const SPEECH_SEGMENT_SOFT_CAP = 280;

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?…]+(?:[.!?…]+|$)\s*/g);
  return matches ? matches.map((s) => s.trim()).filter(Boolean) : [];
}

// A stray short fragment (e.g. a lone numbered-list marker like "4." left over when the
// model ignores VOICE_GUIDE) can get boxed between two near-cap segments and end up in a
// segment of its own — spoken as an isolated, oddly-clipped utterance. Merge anything
// under this length into the previous segment instead of leaving it standing alone.
const MIN_SEGMENT_CHARS = 12;

function mergeTinyFragments(segments: string[]): string[] {
  const out: string[] = [];
  for (const seg of segments) {
    if (seg.length < MIN_SEGMENT_CHARS && out.length) {
      out[out.length - 1] = `${out[out.length - 1]} ${seg}`;
    } else {
      out.push(seg);
    }
  }
  return out;
}

/**
 * splitForSpeech — break already-stripped spoken prose into segments short enough to
 * stream through /tts/stream without risking the upstream timeout, so the client can
 * play them back-to-back (see ConstellationClient.speakReply). Splits on sentence-ending
 * punctuation, grouping consecutive short sentences under SPEECH_SEGMENT_SOFT_CAP into
 * one segment; a single sentence longer than the cap is kept whole rather than cut
 * mid-clause (the exact word-drop-at-boundary bug this replaces guarded against).
 */
export function splitForSpeech(text: string): string[] {
  const sentences = splitSentences(text);
  const segments: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (current && next.length > SPEECH_SEGMENT_SOFT_CAP) {
      segments.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) segments.push(current);
  return mergeTinyFragments(segments);
}

