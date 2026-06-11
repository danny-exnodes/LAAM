import { describe, expect, test, vi } from "vitest";
import { enoughText, runPdfTiers } from "./pdf";

const LONG = "Nội dung văn bản đủ dài để coi là PDF text thật, vượt ngưỡng tối thiểu.";

describe("enoughText", () => {
  test("chuỗi đủ chữ → true", () => {
    expect(enoughText(LONG)).toBe(true);
  });
  test("rỗng / quá ít chữ → false (scan)", () => {
    expect(enoughText("")).toBe(false);
    expect(enoughText("   \n\t  ")).toBe(false);
    expect(enoughText("vài chữ")).toBe(false);
  });
});

describe("runPdfTiers — chuỗi 3 tầng", () => {
  const render = (n: number) =>
    vi.fn(async (max: number) => Array.from({ length: Math.min(n, max) }, (_, i) => "data:image/jpeg;base64,PAGE" + i));

  test("Tier 1: text-layer đủ chữ → via=text, KHÔNG render/OCR", async () => {
    const renderPages = render(5);
    const ocr = vi.fn();
    const r = await runPdfTiers({ getText: async () => LONG, renderPages, ocr, visionMax: 2 });
    expect(r).toEqual({ via: "text", text: LONG });
    expect(renderPages).not.toHaveBeenCalled(); // không render khi đã có text
    expect(ocr).not.toHaveBeenCalled();
  });

  test("Tier 2: scan + OCR đủ chữ → via=ocr (gộp mọi trang)", async () => {
    const renderPages = render(3);
    const ocr = vi.fn(async () => LONG);
    const r = await runPdfTiers({ getText: async () => "", renderPages, ocr, visionMax: 2 });
    expect(r.via).toBe("ocr");
    if (r.via === "ocr") expect(r.text).toContain(LONG);
    expect(renderPages).toHaveBeenCalled();
    expect(ocr).toHaveBeenCalledTimes(3); // OCR mọi trang
  });

  test("Tier 3: OCR chạy nhưng quá ít chữ → via=vision (reason ocr-failed, ≤visionMax ảnh)", async () => {
    const renderPages = render(5);
    const ocr = vi.fn(async () => " "); // scan mờ → OCR rỗng
    const r = await runPdfTiers({ getText: async () => "", renderPages, ocr, visionMax: 2 });
    expect(r.via).toBe("vision");
    if (r.via === "vision") {
      expect(r.reason).toBe("ocr-failed");
      expect(r.images).toHaveLength(2); // cắt theo visionMax
    }
  });

  test("Tier 3: OCR KHÔNG khả dụng → via=vision (reason ocr-unavailable), không gọi OCR", async () => {
    const renderPages = render(5);
    const r = await runPdfTiers({ getText: async () => "", renderPages, ocr: undefined, visionMax: 1 });
    expect(r.via).toBe("vision");
    if (r.via === "vision") {
      expect(r.reason).toBe("ocr-unavailable");
      expect(r.images).toHaveLength(1);
    }
    // OCR off → chỉ render đủ số ảnh vision (không render 20 trang vô ích).
    expect(renderPages).toHaveBeenCalledWith(1);
  });

  test("1 trang OCR ném lỗi → bỏ qua trang đó, vẫn dùng trang còn lại", async () => {
    const renderPages = render(2);
    let call = 0;
    const ocr = vi.fn(async () => {
      call++;
      if (call === 1) throw new Error("ocr page 1 fail");
      return LONG;
    });
    const r = await runPdfTiers({ getText: async () => "", renderPages, ocr, visionMax: 2 });
    expect(r.via).toBe("ocr"); // trang 2 cứu
  });

  test("không render được trang nào → via=empty", async () => {
    const r = await runPdfTiers({ getText: async () => "", renderPages: async () => [], ocr: vi.fn(), visionMax: 2 });
    expect(r.via).toBe("empty");
  });
});
