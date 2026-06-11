// Chuỗi 3 tầng trích nội dung PDF — LOGIC THUẦN (primitive được TIÊM), độc lập
// nơi chạy: server (poppler `pdftotext`/`pdftoppm` + tesseract — xem pdf-server.ts)
// hay bất kỳ. Tách khỏi mọi I/O nên unit-test đầy đủ bằng mock (pdf-tiers.test.ts).
//   1) text-layer (PDF "thật").
//   2) scan → render từng trang → OCR.
//   3) OCR thiếu/thất bại/rỗng → CHỐT CHẶN CUỐI: trả ảnh trang cho kênh vision
//      (qwen3-vl tự đọc).

export const PDF_MAX_PAGES = 20; // trần số trang xử lý (OCR/vision tốn token + thời gian)
const MIN_TEXT_CHARS = 40; // dưới ngưỡng (sau bỏ khoảng trắng) ⇒ coi như KHÔNG có text-layer (scan)

/** Text trích được có "đủ dùng" không — phân biệt PDF text thật vs scan (rỗng chữ). */
export function enoughText(s: string): boolean {
  return s.replace(/\s+/g, "").length >= MIN_TEXT_CHARS;
}

export type PdfTierResult =
  | { via: "text"; text: string }
  | { via: "ocr"; text: string }
  | { via: "vision"; images: string[]; reason: "ocr-failed" | "ocr-unavailable" }
  | { via: "empty" };

// Chuỗi 3 tầng — primitive được tiêm:
//   getText: text-layer; renderPages(max): PNG/JPEG dataURL của ≤max trang;
//   ocr: undefined = không khả dụng (tesseract off) ⇒ bỏ qua thẳng tới vision.
export async function runPdfTiers(opts: {
  getText: () => Promise<string>;
  renderPages: (max: number) => Promise<string[]>;
  ocr?: (imageDataUrl: string) => Promise<string>;
  visionMax: number;
}): Promise<PdfTierResult> {
  // Tier 1 — text-layer.
  const text = await opts.getText();
  if (enoughText(text)) return { via: "text", text: text.trim() };

  // Tier 2 — scan + OCR (nếu tesseract khả dụng).
  if (opts.ocr) {
    const pages = await opts.renderPages(PDF_MAX_PAGES);
    if (!pages.length) return { via: "empty" };
    let ocrText = "";
    for (const img of pages) {
      try {
        ocrText += (await opts.ocr(img)) + "\n";
      } catch {
        /* 1 trang OCR lỗi → bỏ qua, vẫn thử trang khác */
      }
    }
    if (enoughText(ocrText)) return { via: "ocr", text: ocrText.trim() };
    // Tier 3 — OCR chạy nhưng quá ít chữ (scan mờ/chữ viết tay…) → vision đọc ảnh.
    return { via: "vision", images: pages.slice(0, opts.visionMax), reason: "ocr-failed" };
  }

  // OCR không khả dụng → thẳng tới vision (chỉ render đủ số ảnh vision cần).
  const pages = await opts.renderPages(Math.max(1, opts.visionMax));
  if (!pages.length) return { via: "empty" };
  return { via: "vision", images: pages, reason: "ocr-unavailable" };
}
