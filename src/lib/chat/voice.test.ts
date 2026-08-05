import { describe, it, expect } from "vitest";
import {
  speechSupport,
  langToBcp47,
  stripForSpeech,
  splitForSpeech,
  SPEECH_SEGMENT_SOFT_CAP,
  extractForSpeech,
} from "./voice";
import { pickTurnView } from "@/lib/agent/view";

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

// INTENT: a long reply streamed through /tts/stream in ONE request can take far longer
// to synthesize than any sane upstream timeout (measured: 3651 chars of real VieNeu-CPU
// output took 149s to generate 266s of audio, vs. the route's 60s cap) — the connection
// gets killed mid-speech. splitForSpeech breaks spoken prose into segments short enough
// that each /tts/stream call finishes comfortably inside the timeout, streamed back-to-back.
describe("voice.splitForSpeech", () => {
  it("returns a single segment for short text (no unnecessary splitting)", () => {
    expect(splitForSpeech("Xin chào, đây là một câu ngắn.")).toEqual(["Xin chào, đây là một câu ngắn."]);
  });

  it("returns an empty array for empty input", () => {
    expect(splitForSpeech("")).toEqual([]);
    expect(splitForSpeech("   ")).toEqual([]);
  });

  it("groups consecutive short sentences into one segment under the soft cap", () => {
    const out = splitForSpeech("Câu một. Câu hai. Câu ba.");
    expect(out).toEqual(["Câu một. Câu hai. Câu ba."]);
  });

  it("starts a new segment once adding the next sentence would exceed the soft cap", () => {
    const sentence = "Đây là một câu khá dài để kiểm tra ngưỡng cắt đoạn cho chắc ăn nè."; // ~66 chars
    const sentences = Array(6).fill(sentence).join(" "); // ~400+ chars, well past the cap
    const out = splitForSpeech(sentences);
    expect(out.length).toBeGreaterThan(1);
    // No content lost: rejoining every segment reproduces every sentence.
    expect(out.join(" ").replace(/\s+/g, " ")).toBe(sentences.replace(/\s+/g, " "));
    // Every segment respects the cap, EXCEPT a segment that is a single oversized
    // sentence with nothing to group it with (never split further — accepted edge case).
    for (const seg of out) {
      expect(seg.length <= SPEECH_SEGMENT_SOFT_CAP || seg === sentence.trim()).toBe(true);
    }
  });

  it("keeps a trailing sentence fragment with no terminal punctuation as its own segment", () => {
    const out = splitForSpeech("Câu đầy đủ. còn đây là phần còn thiếu dấu câu");
    expect(out.join(" ")).toContain("còn đây là phần còn thiếu dấu câu");
  });

  it("treats a single sentence longer than the soft cap as one unsplit segment", () => {
    const longSentence = "M".repeat(SPEECH_SEGMENT_SOFT_CAP + 50) + ".";
    const out = splitForSpeech(longSentence);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(longSentence);
  });

  // INTENT: a stray short fragment (e.g. a lone numbered-list marker like "4." left over
  // when the model ignores VOICE_GUIDE) can get boxed between two near-cap segments and
  // pushed into a segment of its own — spoken as an isolated, oddly-clipped utterance.
  // It should be merged into the previous segment instead of standing alone.
  it("merges a stray short fragment into the previous segment instead of leaving it isolated", () => {
    const almostFull = "A".repeat(277) + "."; // 278 chars — adding "X." would exceed the cap
    const out = splitForSpeech(`${almostFull} X.`);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("X.");
  });
});

describe("extractForSpeech", () => {
  const TABLE = [
    "| Store | Variance |",
    "|---|---|",
    "| PH-005 | 1015 |",
    "| PH-003 | 542 |",
  ].join("\n");

  it("bảng GFM ra descriptor, và BIẾN MẤT khỏi lời nói", () => {
    const { speech, descriptors } = extractForSpeech(`Kết quả đây.\n\n${TABLE}\n\nHết.`);
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].kind).toBe("table");
    expect(descriptors[0].source).toEqual({ type: "model" });
    expect(descriptors[0].columns?.map((c) => c.label)).toEqual(["Store", "Variance"]);
    expect(descriptors[0].rows).toEqual([
      { Store: "PH-005", Variance: "1015" },
      { Store: "PH-003", Variance: "542" },
    ]);
    expect(speech).toBe("Kết quả đây. Hết.");
  });

  it("block chart ra descriptor kind=chart và biến mất khỏi lời nói", () => {
    const md = 'Xem biểu đồ.\n\n```chart\n{"type":"bar","title":"T","data":{"labels":["a"],"datasets":[{"data":[1]}]}}\n```';
    const { speech, descriptors } = extractForSpeech(md);
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].kind).toBe("chart");
    expect(descriptors[0].title).toBe("T");
    expect(speech).toBe("Xem biểu đồ.");
  });

  it("REGRESSION — đây là chỗ VOICE_GUIDE đã thất bại 2 lần: lời nói không còn cú pháp bảng", () => {
    const { speech } = extractForSpeech(`## Tiêu đề\n\n${TABLE}\n\n**Đậm** xong.`);
    expect(speech).not.toMatch(/\|/);
    expect(speech).not.toMatch(/```/);
    expect(speech).not.toMatch(/[*#]/);
  });

  it("bảng SAI cú pháp (thiếu dòng ---) → không có descriptor, nội dung vẫn được đọc, không lọt ký tự |", () => {
    const broken = "| Store | Variance |\n| PH-005 | 1015 |";
    const { speech, descriptors } = extractForSpeech(`Trước.\n${broken}\nSau.`);
    expect(descriptors).toHaveLength(0);
    expect(speech).not.toMatch(/\|/);
    expect(speech).toMatch(/PH-005/);
  });

  it("stripForSpeech VẪN để lọt | ở bảng hỏng — lỗi có sẵn, extractForSpeech mới là chỗ được vá", () => {
    // Chốt ranh giới: constraint cấm đổi hành vi stripForSpeech (v2 đang dùng).
    // Test này tồn tại để lần sau ai đó "tiện tay sửa luôn" thì thấy đỏ và phải đọc lý do.
    expect(stripForSpeech("| a | b |\n| c | d |")).toMatch(/\|/);
  });

  it("không có bảng/chart → descriptors rỗng, lời nói y như stripForSpeech", () => {
    const md = "**Chào** bạn.\n\n- một\n- hai";
    expect(extractForSpeech(md)).toEqual({ speech: stripForSpeech(md), descriptors: [] });
  });

  it("stripForSpeech KHÔNG đổi hành vi — v2 vẫn cần bảng đọc thành văn xuôi", () => {
    expect(stripForSpeech(TABLE)).toMatch(/Store: PH-005/);
  });

  it("block chart JSON hỏng → không descriptor, văn xuôi xung quanh vẫn được đọc (không nuốt trắng)", () => {
    const md = 'Trước.\n\n```chart\n{not valid json\n```\n\nSau.';
    const { speech, descriptors } = extractForSpeech(md);
    expect(descriptors).toHaveLength(0);
    expect(speech).toContain("Trước");
    expect(speech).toContain("Sau");
    expect(speech).not.toMatch(/```/);
    expect(speech).not.toMatch(/not valid json/);
  });

  it("bảng có header rỗng/trùng tên → không cột nào bị đè mất dữ liệu", () => {
    const md = [
      "| | Tên | Tên |",
      "|---|---|---|",
      "| 1 | A | X |",
      "| 2 | B | Y |",
    ].join("\n");
    const { descriptors } = extractForSpeech(md);
    expect(descriptors).toHaveLength(1);
    // 3 cột hiển thị, label giữ nguyên văn bản gốc (kể cả rỗng/trùng)
    expect(descriptors[0].columns?.map((c) => c.label)).toEqual(["", "Tên", "Tên"]);
    expect(descriptors[0].columns).toHaveLength(3);
    // mỗi hàng giữ đủ 3 giá trị — không cột nào bị ghi đè bởi cột trùng tên
    const values = descriptors[0].rows?.map((r) => Object.values(r));
    expect(values).toEqual([
      ["1", "A", "X"],
      ["2", "B", "Y"],
    ]);
  });

  // ConstellationClient (nguồn B, speakReply) chọn view bằng pickTurnView(descriptors),
  // KHÔNG phải descriptors[0] — vì extractForSpeech xử lý block chart TRƯỚC bảng, nên
  // descriptors[0] luôn là chart dù bảng đứng trước trong văn bản; và bất kỳ descriptor
  // nào sau cái đầu tiên sẽ bị descriptors[0] âm thầm bỏ qua. Test này khoá đúng hành vi
  // tiêu dùng mà ConstellationClient.tsx phải dùng.
  it("tiêu dùng qua pickTurnView (không phải descriptors[0]): bảng đứng TRƯỚC chart trong văn bản vẫn được chọn", () => {
    const md = [
      "Đây là bảng trước:",
      TABLE,
      "Và biểu đồ sau:",
      '```chart',
      '{"type":"bar","title":"T","data":{"labels":["a"],"datasets":[{"data":[1]}]}}',
      '```',
    ].join("\n\n");
    const { descriptors } = extractForSpeech(md);
    // extractForSpeech xử lý chart trước → descriptors[0] là chart dù bảng đứng trước
    // trong văn bản gốc — đây chính là cái bẫy mà descriptors[0] rơi vào.
    expect(descriptors[0].kind).toBe("chart");
    expect(descriptors).toHaveLength(2);
    // pickTurnView chọn ĐÚNG: bảng/chart CUỐI trong mảng — ở đây là bảng (đứng sau
    // trong mảng vì được xử lý sau), không phải chart mà descriptors[0] sẽ chọn nhầm.
    const picked = pickTurnView(descriptors);
    expect(picked?.kind).toBe("table");
  });

  it("chỉ có 1 descriptor (đường thường) → pickTurnView chọn đúng cái đó, giống descriptors[0]", () => {
    const md = `Kết quả đây.\n\n${TABLE}\n\nHết.`;
    const { descriptors } = extractForSpeech(md);
    expect(pickTurnView(descriptors)).toEqual(descriptors[0]);
  });
});

