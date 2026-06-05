// Giao thức frame chung cho stream /api/chat: text thường + frame metadata bọc cặp
// U+001E. THUẦN — server dùng encodeFrame, client dùng splitFrames. SP-4 sở hữu (D-SP4-2).
// SP-2 import encodeFrame + ChatFrame ('pending_write') từ ĐÂY (1 nguồn, không bản 2).
export const FRAME_SEP = "\x1e"; // U+001E record separator

export type ChatFrame =
  | { t: "tokens"; i: number; o: number }
  | { t: "tool"; phase: "call" | "result"; c: number; name: string; args?: string; ok?: boolean }
  | { t: "cite"; names: string[] }
  | { t: "pending_write"; token: string; tool: string; title: string; summary: string; fields?: { label: string; value: string }[] }
  // SP-3/FEAT-2: proactive alert surfaced as a distinct card (not appended to the
  // model's reply). Numbers are code-derived from agent_session (Rule 13).
  | { t: "proactive"; alerts: { type: "stuck" | "cost"; project: string; minutesIdle?: number; costUsd?: number }[] };

// 1 frame = SEP + JSON-1-dòng + SEP. JSON.stringify đảm bảo không lọt SEP thô vào JSON.
export function encodeFrame(f: ChatFrame): string {
  return FRAME_SEP + JSON.stringify(f) + FRAME_SEP;
}

// Tách text hiển thị khỏi frame. text = byte ngoài các cặp SEP; frame = đoạn giữa cặp.
// GUARD (D-SP4-2): SEP mở CHƯA có SEP đóng (frame đuôi một-phần / stream cắt giữa chunk)
// ⇒ pending: loại khỏi text, KHÔNG parse, KHÔNG render. An toàn gọi trên buffer từng-phần
// (mỗi chunk) — luôn cho text "sạch" tới SEP mở cuối, không rò U+001E{… ra bong bóng.
export function splitFrames(raw: string): { text: string; frames: ChatFrame[] } {
  let text = "";
  const frames: ChatFrame[] = [];
  let i = 0;
  while (i < raw.length) {
    const open = raw.indexOf(FRAME_SEP, i);
    if (open === -1) { text += raw.slice(i); break; }
    text += raw.slice(i, open);
    const close = raw.indexOf(FRAME_SEP, open + 1);
    if (close === -1) break; // frame đuôi chưa đóng → pending; bỏ phần còn lại khỏi text
    try {
      const f = JSON.parse(raw.slice(open + 1, close)) as ChatFrame;
      if (f && typeof (f as { t?: unknown }).t === "string") frames.push(f);
    } catch { /* frame hỏng → bỏ qua (fail-soft) */ }
    i = close + 1;
  }
  return { text, frames };
}
