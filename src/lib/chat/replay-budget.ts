// Provider-aware replay budget cho lịch sử hội thoại (đối xứng với resultBound /
// BYTEPLUS_TOOL_BUDGET_CHARS trong route.ts — hai đường đó đã provider-aware, riêng
// đường replay thì chưa): budget cũ dẫn xuất từ num_ctx 16k của model LOCAL nhưng áp
// cho CẢ cloud → hội thoại phân tích dài bị nén thành summary văn xuôi (mất số liệu,
// ID, bảng — đúng thứ turn sau cần lại) từ ~turn 15 dù cửa sổ cloud ~128k.
//
// Cloud được budget lớn hơn nhiều nhưng vẫn BOUNDED có chủ đích: replay dài hơn nghĩa
// là mỗi turn gửi nhiều token hơn (chậm + tốn hơn) — 150k chars (~43k token) là điểm
// cân; chỉnh qua env CLOUD_REPLAY_BUDGET_CHARS. Không bao giờ thấp hơn budget local.
import { isBytePlusModel } from "@/lib/llm/byteplus";
import { isCerebrasModel } from "@/lib/llm/cerebras";
import { isClaudeModel } from "@/lib/llm/claude";

export const DEFAULT_CLOUD_REPLAY_BUDGET_CHARS = 150_000;

export function replayBudgetFor(model: string, localBudgetChars: number): number {
  if (!isBytePlusModel(model) && !isCerebrasModel(model) && !isClaudeModel(model)) return localBudgetChars;
  const cloud = Number(process.env.CLOUD_REPLAY_BUDGET_CHARS) || DEFAULT_CLOUD_REPLAY_BUDGET_CHARS;
  return Math.max(localBudgetChars, cloud);
}
