// Câu trỏ panel do CODE chèn, không phải model nói (Rule 5). Điều kiện là "có
// descriptor", biết được ngay lúc lắp lời nói — KHÔNG phải "panel đã render", thứ mà
// pipeline nói không thể biết (TTS_PREBUFFER_SECONDS = 3, ~4.3s tới audio đầu).
// Không nhắc vị trí ("bên phải") vì panel nằm giữa và bố cục đổi theo thiết bị.
export function withPointer(speech: string, hasView: boolean, pointer: string): string {
  if (!speech || !hasView) return speech;
  return `${speech} ${pointer}`;
}
