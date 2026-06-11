import { describe, expect, test } from "vitest";
import { sanitizeAttachments, MAX_ATTACHMENTS, MAX_PREVIEW_CHARS } from "./attachment-meta";

describe("sanitizeAttachments — trust boundary cho body.attachments", () => {
  test("không phải mảng → []", () => {
    expect(sanitizeAttachments(undefined)).toEqual([]);
    expect(sanitizeAttachments(null)).toEqual([]);
    expect(sanitizeAttachments("x")).toEqual([]);
    expect(sanitizeAttachments({})).toEqual([]);
  });

  test("entry hợp lệ → giữ name/kind/mime/size/preview", () => {
    const r = sanitizeAttachments([
      { name: "a.pdf", kind: "file", mime: "application/pdf", size: 1234, preview: "data:image/jpeg;base64,AAAA" },
    ]);
    expect(r).toEqual([
      { name: "a.pdf", kind: "file", mime: "application/pdf", size: 1234, preview: "data:image/jpeg;base64,AAAA" },
    ]);
  });

  test("thiếu name → loại bỏ", () => {
    expect(sanitizeAttachments([{ kind: "image" }, { name: "", kind: "file" }])).toEqual([]);
  });

  test("kind lạ → ép về 'file'; chỉ image/url giữ nguyên", () => {
    const r = sanitizeAttachments([
      { name: "1", kind: "weird" },
      { name: "2", kind: "image" },
      { name: "3", kind: "url" },
    ]);
    expect(r.map((a) => a.kind)).toEqual(["file", "image", "url"]);
  });

  test("preview không phải data: URL → bỏ preview (giữ entry)", () => {
    const r = sanitizeAttachments([{ name: "x", kind: "image", preview: "https://evil/x.png" }]);
    expect(r).toEqual([{ name: "x", kind: "image" }]);
  });

  test("preview vượt cap → bỏ preview (DB hygiene)", () => {
    const big = "data:image/jpeg;base64," + "A".repeat(MAX_PREVIEW_CHARS);
    const r = sanitizeAttachments([{ name: "x", kind: "image", preview: big }]);
    expect(r[0].preview).toBeUndefined();
  });

  test("cap số lượng ở MAX_ATTACHMENTS", () => {
    const many = Array.from({ length: MAX_ATTACHMENTS + 5 }, (_, i) => ({ name: `f${i}`, kind: "file" }));
    expect(sanitizeAttachments(many)).toHaveLength(MAX_ATTACHMENTS);
  });

  test("size âm/không hữu hạn → bỏ qua", () => {
    const r = sanitizeAttachments([{ name: "x", kind: "file", size: -5 }, { name: "y", kind: "file", size: Infinity }]);
    expect(r[0].size).toBe(0);
    expect(r[1].size).toBeUndefined();
  });
});
