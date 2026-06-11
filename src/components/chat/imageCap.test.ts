import { describe, expect, test } from "vitest";
import { MAX_RAW_IMAGES, MAX_RAW_IMAGE_B64_CHARS, rawImageVerdict } from "./imageCap";

// W3 vision — cap client. INTENT: host 16GB VRAM + CHAT_NUM_CTX=16384 — quá 2
// ảnh / ảnh quá 2MB sau encode làm tràn ctx + VRAM decode; client phải chặn
// TRƯỚC khi gửi và degrade sang OCR-text (notice i18n), KHÔNG để server 400
// (trần server ~2.8MB/ảnh rộng hơn cap client → client hợp lệ không bao giờ
// bị server reject).
describe("W3 vision: rawImageVerdict (cap client)", () => {
  test("ảnh thứ 3 trong lượt bị chặn → 'count' (rơi về OCR-text)", () => {
    expect(rawImageVerdict(MAX_RAW_IMAGES, 10)).toBe("count");
    expect(rawImageVerdict(MAX_RAW_IMAGES + 1, 10)).toBe("count");
  });

  test("ảnh > 2MB sau encode bị chặn → 'size' (rơi về OCR-text)", () => {
    expect(rawImageVerdict(0, MAX_RAW_IMAGE_B64_CHARS + 1)).toBe("size");
  });

  test("≤2 ảnh, đúng cỡ (kể cả biên 2MB) → 'ok' (đi kênh ảnh raw)", () => {
    expect(rawImageVerdict(0, MAX_RAW_IMAGE_B64_CHARS)).toBe("ok");
    expect(rawImageVerdict(MAX_RAW_IMAGES - 1, 1000)).toBe("ok");
  });
});
