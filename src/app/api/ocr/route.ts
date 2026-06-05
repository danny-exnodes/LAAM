import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { auth } from "@/auth";

// POST /api/ocr — read text from an image (or scanned-PDF page rendered to PNG)
// via the system `tesseract` (vie+eng+chi_sim). Accepts a base64 data URL,
// returns the recognised text. Pure Node — no new deps. Fail-soft so a blurry
// scan never breaks the chat. Ported from v1 bin/laam.js.

const MAX_BYTES = 12 * 1024 * 1024;

// Validate + decode a base64 image data URL. Returns the decoded buffer and a
// tesseract-friendly extension (jpeg→jpg, tiff→tif), or null when invalid.
// Pure — unit-testable without I/O.
export function parseImageDataUrl(
  image: unknown,
): { buf: Buffer; ext: string } | null {
  if (typeof image !== "string") return null;
  const m = image.match(/^data:image\/(png|jpe?g|webp|bmp|gif|tiff?);base64,(.+)$/i);
  if (!m) return null;
  const ext = m[1].toLowerCase().replace("jpeg", "jpg").replace("tiff", "tif");
  return { buf: Buffer.from(m[2], "base64"), ext };
}

function tesseractAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("tesseract", ["--version"], { timeout: 5000 }, (err) => resolve(!err));
  });
}

function runTesseract(tmp: string, lang: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "tesseract",
      [tmp, "stdout", "-l", lang],
      { timeout: 45000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout || "")),
    );
  });
}

// GET /api/ocr — report whether OCR is usable on this host. The FE calls this
// once so it can degrade gracefully (disable the image-attach affordance, warn
// up front) instead of letting an image upload fail with "thiếu tesseract".
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  return Response.json({ available: await tesseractAvailable() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { image?: unknown; lang?: unknown }
    | null;

  const parsed = parseImageDataUrl(body?.image);
  if (!parsed) {
    return Response.json({ error: "ảnh không hợp lệ" }, { status: 400 });
  }
  if (!(await tesseractAvailable())) {
    return Response.json(
      { error: "OCR chưa sẵn sàng: thiếu tesseract trên máy chủ" },
      { status: 503 },
    );
  }
  if (parsed.buf.length > MAX_BYTES) {
    return Response.json({ error: "ảnh quá lớn cho OCR" }, { status: 413 });
  }

  const lang =
    typeof body?.lang === "string" && /^[a-z+_]+$/i.test(body.lang)
      ? body.lang
      : "vie+eng+chi_sim";
  const tmp = path.join(
    os.tmpdir(),
    "laam-ocr-" + Date.now() + "-" + Math.random().toString(36).slice(2) + "." + parsed.ext,
  );

  try {
    await fs.writeFile(tmp, parsed.buf);
    const text = await runTesseract(tmp, lang);
    return Response.json({ text: String(text) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "OCR thất bại: " + msg }, { status: 500 });
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
}
