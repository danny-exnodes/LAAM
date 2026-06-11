// Trích nội dung PDF phía client, chuỗi 3 tầng (yêu cầu production):
//   1) text-layer (pdfjs getTextContent) — PDF "thật".
//   2) scan → render từng trang → /api/ocr (tesseract).
//   3) OCR thiếu/thất bại/rỗng → CHỐT CHẶN CUỐI: đẩy ảnh trang vào kênh vision để
//      qwen3-vl tự đọc.
// pdfjs nạp ĐỘNG (browser-only) để không vỡ SSR. Worker = static asset
// /pdf.worker.min.mjs (copy từ pdfjs-dist@6 — re-copy khi nâng cấp; xem public/).

export const PDF_MAX_PAGES = 20; // trần số trang xử lý (OCR/vision tốn token + thời gian)
export const PDF_RENDER_SCALE = 2.0; // độ phân giải render (đủ nét cho OCR)
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

// Chuỗi 3 tầng — TÁCH khỏi pdfjs (primitive được tiêm) nên test được đầy đủ bằng mock.
// getText: text-layer; renderPages(max): PNG/JPEG dataURL của ≤max trang; ocr: undefined = không khả dụng.
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

// --- Glue pdfjs (browser-only, verify live; logic tier đã test ở runPdfTiers) ---

let workerConfigured = false;
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    // Worker qua `new URL(..., import.meta.url)` — pattern Next khuyến nghị: bundler
    // (Turbopack/webpack) EMIT worker ra /_next/static → serve ở cả dev lẫn Docker
    // standalone, LUÔN khớp version pdfjs đang cài (không copy thủ công vào public/).
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
    workerConfigured = true;
  }
  return pdfjs;
}

/** Đọc 1 file PDF qua chuỗi 3 tầng. `ocr` (POST /api/ocr) truyền undefined nếu tesseract off. */
export async function ingestPdfFile(
  file: File,
  opts: { ocr?: (imageDataUrl: string) => Promise<string>; visionMax: number },
): Promise<PdfTierResult> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(doc.numPages, PDF_MAX_PAGES);

  const getText = async () => {
    let out = "";
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      out += tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    return out;
  };

  const renderPages = async (max: number) => {
    const out: string[] = [];
    const n = Math.min(pageCount, Math.max(1, max));
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      // JPEG q0.85: nhỏ hơn PNG → vừa cap vision 2MB; tesseract vẫn nhận jpeg.
      out.push(canvas.toDataURL("image/jpeg", 0.85));
    }
    return out;
  };

  return runPdfTiers({ getText, renderPages, ocr: opts.ocr, visionMax: opts.visionMax });
}
