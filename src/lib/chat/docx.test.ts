import { describe, expect, test } from "vitest";
import { docxXmlToText, MAX_DOCX_CHARS } from "./docx";

const wrap = (body: string) =>
  `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`;

describe("docxXmlToText", () => {
  test("gộp run trong 1 đoạn, mỗi <w:p> 1 dòng", () => {
    const xml = wrap(
      `<w:p><w:r><w:t>Xin </w:t></w:r><w:r><w:t>chào</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Dòng hai</w:t></w:r></w:p>`,
    );
    expect(docxXmlToText(xml)).toBe("Xin chào\nDòng hai");
  });

  test("decode XML entity (& < > và &amp;lt; literal)", () => {
    const xml = wrap(`<w:p><w:r><w:t>A &amp; B &lt;tag&gt; &amp;lt;x</w:t></w:r></w:p>`);
    expect(docxXmlToText(xml)).toBe("A & B <tag> &lt;x");
  });

  test("<w:tab/> → tab, <w:br/> → xuống dòng", () => {
    const xml = wrap(`<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p>`);
    expect(docxXmlToText(xml)).toBe("A\tB\nC");
  });

  test("giữ xml:space=preserve khoảng trắng trong <w:t>", () => {
    const xml = wrap(`<w:p><w:r><w:t xml:space="preserve">  giữ  </w:t></w:r></w:p>`);
    expect(docxXmlToText(xml)).toBe("giữ"); // trim cuối; nội bộ giữ
  });

  test("không có đoạn nào → rỗng", () => {
    expect(docxXmlToText("<w:document/>")).toBe("");
  });

  test("text cell trong bảng vẫn bóc được (mỗi cell 1 dòng)", () => {
    const xml = wrap(
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>ô1</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>ô2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    );
    expect(docxXmlToText(xml)).toBe("ô1\nô2");
  });

  test("cắt khi vượt MAX_DOCX_CHARS", () => {
    const big = "a".repeat(MAX_DOCX_CHARS + 100);
    const xml = wrap(`<w:p><w:r><w:t>${big}</w:t></w:r></w:p>`);
    const out = docxXmlToText(xml);
    expect(out.length).toBeLessThanOrEqual(MAX_DOCX_CHARS + 20);
    expect(out.endsWith("…(đã cắt)")).toBe(true);
  });
});
