import { describe, it, expect, vi } from "vitest";
import { speechSupport, langToBcp47, stripForSpeech, chunkForSpeech, speakChunks } from "./voice";

// Resolve pending microtasks so producer/consumer loops in speakChunks advance.
const flush = async (times = 6) => {
  for (let i = 0; i < times; i++) await Promise.resolve();
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("voice.speechSupport", () => {
  it("reports false/false for an unsupported (empty) window — the fallback path", () => {
    expect(speechSupport({})).toEqual({ recognition: false, synthesis: false });
    expect(speechSupport(undefined)).toEqual({ recognition: false, synthesis: false });
  });

  it("detects standard and webkit-prefixed recognition + synthesis", () => {
    expect(speechSupport({ SpeechRecognition: class {}, speechSynthesis: {} })).toEqual({
      recognition: true,
      synthesis: true,
    });
    expect(speechSupport({ webkitSpeechRecognition: class {} })).toEqual({
      recognition: true,
      synthesis: false,
    });
  });
});

describe("voice.langToBcp47", () => {
  it("maps each LAAM lang to its exact BCP-47 tag (would fail on reorder/abbrev)", () => {
    // WHY: recognition.lang / utterance.lang reject "vi"/"en"/"zh"; the tag must be
    // mapped in code (Rule 13), not passed through from the cookie.
    expect(langToBcp47("vi")).toBe("vi-VN");
    expect(langToBcp47("en")).toBe("en-US");
    expect(langToBcp47("zh")).toBe("zh-CN");
  });
});

describe("voice.stripForSpeech", () => {
  it("drops a fenced code block and link syntax but keeps visible prose", () => {
    const md = "Xong rồi:\n```js\nconst x = 1;\n```\nXem [tài liệu](http://x) nhé.";
    const out = stripForSpeech(md);
    expect(out).not.toContain("const x");
    expect(out).not.toContain("```");
    expect(out).toContain("tài liệu");
    expect(out).not.toContain("http://x");
  });

  it("strips heading/list/emphasis markers", () => {
    expect(stripForSpeech("# Tiêu đề\n- **một**\n- *hai*")).toBe("Tiêu đề một hai");
  });

  // INTENT: a GFM table read verbatim over TTS is "pipe C4K Staging pipe 428a3084 dash
  // 43da..." (the reported symptom). Each data row must become a short spoken sentence
  // instead — no "|" left, header+value pairs present for every row, not just the first.
  it("converts a GFM table into spoken sentences instead of reading pipe/dash syntax", () => {
    const md = [
      "**Các project hiện có trong DAAB:**",
      "| # | Tên project | Trạng thái |",
      "|---|-------------|------------|",
      "| 1 | C4K Staging | active |",
      "| 2 | Cảng Định An M&A | active |",
    ].join("\n");
    const out = stripForSpeech(md);
    expect(out).not.toContain("|");
    expect(out).not.toContain("---");
    expect(out).toContain("Tên project: C4K Staging");
    expect(out).toContain("Trạng thái: active");
    expect(out).toContain("Tên project: Cảng Định An M&A"); // second row, not just the first
  });

  it("leaves non-table text around a table intact", () => {
    const md = ["Trước bảng.", "| A | B |", "|---|---|", "| x | y |", "Sau bảng."].join("\n");
    const out = stripForSpeech(md);
    expect(out).toContain("Trước bảng");
    expect(out).toContain("A: x");
    expect(out).toContain("Sau bảng");
  });
});

describe("voice.chunkForSpeech", () => {
  // INTENT: /api/tts synth is CPU-bound and the server aborts past 8s (route.ts).
  // A long reply sent as one chunk risks that timeout, which the caller (mis)reads
  // as neural TTS failing and falls back to robotic browser SpeechSynthesis for the
  // WHOLE reply (the reported symptom). Each chunk must stay short enough to synth
  // well within the deadline, and no text may be dropped or reordered across chunks.
  it("returns an empty array for empty/whitespace-only input", () => {
    expect(chunkForSpeech("")).toEqual([]);
    expect(chunkForSpeech("   ")).toEqual([]);
  });

  it("keeps a short reply as a single chunk", () => {
    const text = "Xin chào bạn. Hôm nay trời đẹp.";
    expect(chunkForSpeech(text)).toEqual([text]);
  });

  it("splits a long reply into multiple chunks, each within the char budget, with no text lost", () => {
    const sentences = Array.from({ length: 20 }, (_, i) => `Đây là câu số ${i + 1} trong công thức nấu phở.`);
    const text = sentences.join(" ");
    const chunks = chunkForSpeech(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
    // Every original sentence must still appear, in order, once chunks are rejoined.
    expect(chunks.join(" ")).toBe(text);
  });

  // REGRESSION: a project table whose rows carry UUID ids used to fall back to
  // the robotic browser voice. UUIDs synthesize far slower than their length
  // suggests (read digit-by-digit), so the DEFAULT budget must keep each chunk
  // small enough that a single-UUID chunk still synthesizes under the 8s server
  // deadline. Assert no default chunk exceeds the budget and no chunk contains
  // two UUIDs (which would blow the synthesis time past the timeout).
  it("keeps UUID-bearing table prose in small chunks (default budget)", () => {
    const prose =
      "Tên Project: C4K Staging. Trạng thái: active. ID: 428a3084-43da-4edb-8656-4005a3b19825. " +
      "Tên Project: Dasin. Trạng thái: active. ID: fd474397-491b-4cb1-9f5d-cc451eafbf46.";
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
    const chunks = chunkForSpeech(prose);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(60);
      expect((chunk.match(uuid) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it("word-wraps a single sentence that alone exceeds the char budget", () => {
    const longSentence = "một hai ba bốn năm sáu bảy tám chín mười mười một mười hai mười ba mười bốn";
    const chunks = chunkForSpeech(longSentence, 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(20);
    expect(chunks.join(" ")).toBe(longSentence);
  });

  // REGRESSION (reported "đọc mất chữ" — TTS reads different words than displayed): each
  // chunk synthesizes as an INDEPENDENT request with no cross-chunk prosody, so a plain
  // nearest-space word-wrap can orphan a short word right before a comma at a chunk boundary
  // (e.g. "...M&A, Cảng" | "Định An v3..." — "Cảng" split from "Định An v3"), which the neural
  // TTS backend then drops or garbles in isolation. Wrapping must prefer a comma/semicolon
  // near the budget over an arbitrary space, so a list item stays intact in one chunk.
  it("word-wraps a long comma list at a comma near the budget, not mid-item", () => {
    const text =
      "DAAB hiện có năm dự án: C4K Staging, Cảng Định An M&A, Cảng Định An v3, Dasin và Sala Food.";
    const chunks = chunkForSpeech(text, 60);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(60);
    // "Cảng Định An v3" must stay together in one chunk, not split as "...Cảng" | "Định An v3...".
    expect(chunks.some((c) => c.includes("Cảng Định An v3"))).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text);
  });

  it("falls back to space-wrapping when a comma break would leave a tiny lead chunk", () => {
    const text = "A, và sau đó là một đoạn văn rất dài tiếp theo không có dấu phẩy nào nữa cho đến hết câu luôn";
    const chunks = chunkForSpeech(text, 60);
    // The comma sits right after "A" (index 1) — using it would produce a near-empty "A," lead
    // chunk (an extra synth round-trip for two characters); space-wrapping avoids that here.
    expect(chunks[0]).not.toBe("A,");
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(60);
    expect(chunks.join(" ")).toBe(text);
  });
});

describe("voice.speakChunks", () => {
  it("plays every chunk in order and revokes each URL", async () => {
    const played: string[] = [];
    const revoked: string[] = [];
    await speakChunks(["a", "b", "c"], {
      synth: async (t) => `u:${t}`,
      play: async (u) => { played.push(u); return true; },
      fallback: () => { throw new Error("fallback must not run on success"); },
      revoke: (u) => { revoked.push(u); },
    });
    expect(played).toEqual(["u:a", "u:b", "u:c"]);
    expect(revoked.sort()).toEqual(["u:a", "u:b", "u:c"]);
  });

  // INTENT (the reported "khựng lại" stutter): the next chunk must be synthesized
  // WHILE the current one is still playing, not after it finishes — otherwise
  // every chunk boundary has a multi-second silent synthesis gap. This test
  // pauses playback of the first chunk and asserts the later chunks have already
  // been synthesized by then.
  it("synthesizes upcoming chunks while the current one is still playing", async () => {
    const synthed: string[] = [];
    const gate = deferred<boolean>();
    const p = speakChunks(["a", "b", "c"], {
      synth: async (t) => { synthed.push(t); return `u:${t}`; },
      play: async (u) => (u === "u:a" ? gate.promise : true), // hold on the first chunk
      fallback: () => {},
      revoke: () => {},
    });
    await flush();
    // First chunk is still playing, yet b and c are already synthesized ahead.
    expect(synthed).toEqual(["a", "b", "c"]);
    gate.resolve(true);
    await p;
  });

  it("does not run two syntheses at once (one request at a time)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await speakChunks(["a", "b", "c"], {
      synth: async (t) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        return `u:${t}`;
      },
      play: async () => true,
      fallback: () => {},
      revoke: () => {},
    });
    expect(maxInFlight).toBe(1);
  });

  it("falls back with the remaining text (from the failing chunk) when synthesis fails", async () => {
    const played: string[] = [];
    const fallback = vi.fn();
    await speakChunks(["a", "b", "c"], {
      synth: async (t) => (t === "b" ? null : `u:${t}`),
      play: async (u) => { played.push(u); return true; },
      fallback,
      revoke: () => {},
    });
    expect(played).toEqual(["u:a"]); // only the first chunk played
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledWith("b c"); // remaining text, not just the first
  });

  it("falls back (including the current chunk) when playback fails, and revokes the prefetched url", async () => {
    const revoked: string[] = [];
    const fallback = vi.fn();
    await speakChunks(["a", "b"], {
      synth: async (t) => `u:${t}`,
      play: async (u) => u !== "u:a", // first chunk fails to play
      fallback,
      revoke: (u) => { revoked.push(u); },
    });
    expect(fallback).toHaveBeenCalledWith("a b"); // failing chunk's text is re-spoken
    expect(revoked).toContain("u:b"); // the chunk synthesized ahead but never played is freed
  });

  it("returns immediately for an empty chunk list", async () => {
    const synth = vi.fn();
    await speakChunks([], { synth, play: async () => true, fallback: () => {} });
    expect(synth).not.toHaveBeenCalled();
  });
});
