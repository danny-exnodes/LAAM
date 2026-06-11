import { describe, expect, test } from "vitest";
import { isPdfFile, looksBinaryText, stripNul } from "./attach";

const NUL = String.fromCharCode(0);

describe("isPdfFile", () => {
  test("nhận PDF qua MIME", () => {
    expect(isPdfFile("x", "application/pdf")).toBe(true);
  });
  test("nhận PDF qua đuôi .pdf khi type rỗng (kéo-thả)", () => {
    expect(isPdfFile("Report.PDF", "")).toBe(true);
  });
  test("file văn bản không phải PDF", () => {
    expect(isPdfFile("a.txt", "text/plain")).toBe(false);
  });
});

// NUL (byte 0) là thủ phạm 500 "Lỗi server": file nhị phân đọc-as-text chứa NUL →
// Postgres TEXT không lưu được → insert ném. Hai helper này chặn từ gốc.
describe("looksBinaryText / stripNul", () => {
  test("văn bản thường → không bị coi là nhị phân", () => {
    expect(looksBinaryText("hello\nworld\t!")).toBe(false);
  });
  test("chuỗi chứa NUL → nhị phân", () => {
    expect(looksBinaryText("a" + NUL + "b")).toBe(true);
  });
  test("stripNul bỏ mọi NUL, giữ phần còn lại (để Postgres TEXT lưu được)", () => {
    expect(stripNul(NUL + "PDF" + NUL + "data" + NUL)).toBe("PDFdata");
    expect(stripNul("clean")).toBe("clean");
  });
});
