// W3 vision — cap kênh ảnh raw phía client (ChatClient/Composer). Mỗi lượt gửi
// tối đa 2 ảnh base64, mỗi ảnh ≤ 2MB SAU encode (đo bằng b64.length). Vì sao:
// host 16GB VRAM (RTX 5070 Ti) + CHAT_NUM_CTX=16384 — mỗi ảnh ngốn vision-token
// trong ctx lẫn VRAM decode cạnh KV-cache. Cap client đặt DƯỚI trần cứng server
// (~2.8MB/ảnh — /api/chat trả 400) để vượt cap được degrade THÂN THIỆN tại chỗ
// (thông báo i18n + chỉ dùng OCR-text như cũ) thay vì chết cả request.
export const MAX_RAW_IMAGES = 2;
export const MAX_RAW_IMAGE_B64_CHARS = 2 * 1024 * 1024; // 2MB sau base64-encode

export type RawImageVerdict = "ok" | "count" | "size";

// Quyết định cho MỘT ảnh sắp đính kèm: "count" = đã đủ 2 ảnh raw trong lượt,
// "size" = ảnh vượt 2MB sau encode. Caller map verdict → key i18n (chat.imgCap*)
// và rơi về đường OCR-text (không giữ b64).
export function rawImageVerdict(currentRawCount: number, b64Length: number): RawImageVerdict {
  if (currentRawCount >= MAX_RAW_IMAGES) return "count";
  if (b64Length > MAX_RAW_IMAGE_B64_CHARS) return "size";
  return "ok";
}
