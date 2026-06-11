import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PDF_MAX_PAGES, runPdfTiers, type PdfTierResult } from "./pdf-tiers";

// Trích nội dung PDF phía SERVER (thay cho pdfjs client — chạy y hệt mọi thiết bị):
//   1) `pdftotext -layout` (poppler) → text-layer.
//   2) scan → `pdftoppm` render trang→JPEG → `tesseract` OCR.
//   3) OCR rỗng/thiếu → trả ảnh trang cho kênh vision (qwen3-vl đọc).
// Logic 3 tầng = runPdfTiers (thuần, đã test); file này chỉ tiêm primitive poppler/tesseract.
// Pure Node (execFile), không dep mới. poppler-utils + tesseract cài trong image (Dockerfile).

const RENDER_DPI = 200; // đủ nét cho OCR; JPEG q80 ⇒ vừa cap vision 2MB/ảnh
const JPEG_QUALITY = 80;
const TOOL_TIMEOUT = 60_000;
const MAX_BUF = 64 * 1024 * 1024; // stdout pdftotext / ảnh có thể lớn

function which(bin: string, versionArg: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, [versionArg], { timeout: 5000 }, (err) => resolve(!err));
  });
}

/** poppler (`pdftotext`) có trên host không — route degrade rõ ràng nếu thiếu. */
export const popplerAvailable = () => which("pdftotext", "-v");
const tesseractAvailable = () => which("tesseract", "--version");

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: TOOL_TIMEOUT, maxBuffer: MAX_BUF }, (err, stdout) =>
      err ? reject(err) : resolve(stdout || ""),
    );
  });
}

// Đọc 1 PDF (bytes) qua chuỗi 3 tầng. Quản tmp-dir + cleanup. visionMax = số ảnh
// trang tối đa đẩy vào kênh vision (cap raw-image của client).
export async function extractPdf(
  buf: Buffer,
  opts: { visionMax: number },
): Promise<PdfTierResult> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laam-pdf-"));
  const pdfPath = path.join(dir, "in.pdf");
  const hasOcr = await tesseractAvailable();

  try {
    await fs.writeFile(pdfPath, buf);

    // Tier 1 — text-layer (cap PDF_MAX_PAGES trang để text không phình vô hạn).
    const getText = async () => {
      try {
        return await run("pdftotext", ["-layout", "-f", "1", "-l", String(PDF_MAX_PAGES), pdfPath, "-"]);
      } catch {
        return ""; // PDF mã hoá/hỏng text-layer → coi như scan, rớt xuống render/OCR
      }
    };

    // Render ≤max trang đầu → JPEG dataURL (poppler `pdftoppm`).
    const renderPages = async (max: number) => {
      const n = Math.min(PDF_MAX_PAGES, Math.max(1, max));
      const prefix = path.join(dir, "page");
      try {
        await run("pdftoppm", [
          "-jpeg", "-jpegopt", `quality=${JPEG_QUALITY}`,
          "-r", String(RENDER_DPI), "-f", "1", "-l", String(n), pdfPath, prefix,
        ]);
      } catch {
        return [];
      }
      const files = (await fs.readdir(dir))
        .filter((f) => f.startsWith("page") && f.endsWith(".jpg"))
        .sort((a, b) => pageNo(a) - pageNo(b));
      const out: string[] = [];
      for (const f of files) {
        const b64 = (await fs.readFile(path.join(dir, f))).toString("base64");
        out.push(`data:image/jpeg;base64,${b64}`);
      }
      return out;
    };

    // OCR 1 ảnh dataURL (tesseract vie+eng+chi_sim). undefined nếu tesseract off.
    const ocr = hasOcr
      ? async (dataUrl: string) => {
          const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
          const imgPath = path.join(dir, `ocr-${Math.random().toString(36).slice(2)}.jpg`);
          await fs.writeFile(imgPath, Buffer.from(b64, "base64"));
          try {
            return await run("tesseract", [imgPath, "stdout", "-l", "vie+eng+chi_sim"]);
          } finally {
            fs.unlink(imgPath).catch(() => {});
          }
        }
      : undefined;

    return await runPdfTiers({ getText, renderPages, ocr, visionMax: opts.visionMax });
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// "page-07.jpg" → 7 (pdftoppm zero-pads theo số trang; sort số học, không lexicographic).
function pageNo(f: string): number {
  const m = f.match(/(\d+)\.jpg$/);
  return m ? Number(m[1]) : 0;
}
