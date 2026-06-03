import { afterEach, describe, expect, test, vi } from "vitest";

// Hoisted mock state: auth result + a tesseract-available flag so we can drive
// the 401 / 503 branches without a real tesseract binary or session.
const h = vi.hoisted(() => ({
  authResult: null as { user?: { id: string } } | null,
  tessOk: true,
  // execFile is used for both `tesseract --version` (availability) and the OCR
  // run. The first arg distinguishes; we only exercise the availability path in
  // these tests (auth/availability/validation short-circuit before the OCR run).
  execFile: vi.fn(
    (_cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, out?: string) => void) => {
      if (args[0] === "--version") cb(h.tessOk ? null : new Error("not found"));
      else cb(null, "recognised text");
    },
  ),
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => h.authResult) }));
vi.mock("node:child_process", () => ({ execFile: h.execFile, default: { execFile: h.execFile } }));

import { POST, parseImageDataUrl } from "./route";

// A 1x1 transparent PNG as a valid base64 data URL.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

function reqWith(image: unknown) {
  return new Request("http://localhost/api/ocr", {
    method: "POST",
    body: JSON.stringify({ image }),
  });
}

afterEach(() => {
  h.authResult = null;
  h.tessOk = true;
  vi.clearAllMocks();
});

describe("parseImageDataUrl", () => {
  test("accepts a png data URL and returns ext + buffer", () => {
    const r = parseImageDataUrl(PNG);
    expect(r).not.toBeNull();
    expect(r!.ext).toBe("png");
    expect(r!.buf.length).toBeGreaterThan(0);
  });

  test("normalises jpeg → jpg and tiff → tif", () => {
    expect(parseImageDataUrl("data:image/jpeg;base64,AAAA")!.ext).toBe("jpg");
    expect(parseImageDataUrl("data:image/tiff;base64,AAAA")!.ext).toBe("tif");
  });

  test("rejects non-image / malformed data URLs", () => {
    expect(parseImageDataUrl("not a data url")).toBeNull();
    expect(parseImageDataUrl("data:text/plain;base64,AAAA")).toBeNull();
    expect(parseImageDataUrl("")).toBeNull();
    expect(parseImageDataUrl(123 as unknown as string)).toBeNull();
  });
});

describe("POST /api/ocr", () => {
  test("401 when unauthenticated", async () => {
    h.authResult = null;
    const res = await POST(reqWith(PNG));
    expect(res.status).toBe(401);
  });

  test("400 when image is not a valid data URL", async () => {
    h.authResult = { user: { id: "u1" } };
    const res = await POST(reqWith("nope"));
    expect(res.status).toBe(400);
  });

  test("503 when tesseract is unavailable", async () => {
    h.authResult = { user: { id: "u1" } };
    h.tessOk = false;
    const res = await POST(reqWith(PNG));
    expect(res.status).toBe(503);
  });
});
