import { describe, it, expect } from "vitest";
import { speechSupport, langToBcp47, stripForSpeech } from "./voice";

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

