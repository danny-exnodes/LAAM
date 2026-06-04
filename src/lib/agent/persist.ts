// SP-3 — trích các lượt tool mà runToolRounds đã APPEND vào convo (từ baseLen trở đi),
// để persist vào chat_tool_call. Thuần — test không cần DB. Đọc giá trị TRẢ VỀ của
// runToolRounds (không dùng ToolEvent, vốn thiếu body/args) — verdict A1.
import type { ChatMessage } from "./orchestrator";

export type ToolTurnRow = {
  seq: number;
  name: string;
  args: unknown;
  result: unknown;
  ok: boolean;
  bytes: number;
};

// args: model có thể gửi object hoặc chuỗi JSON; chuỗi hỏng → {} (khớp makeDispatch).
function parseArgs(v: unknown): unknown {
  if (typeof v !== "string") return v ?? {};
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

// result: tool message content là JSON.stringify(result); hỏng → giữ chuỗi thô.
function parseResult(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

export function extractToolTurns(convo: ChatMessage[], baseLen: number): ToolTurnRow[] {
  const rows: ToolTurnRow[] = [];
  let seq = 0;
  let i = Math.max(0, baseLen);
  while (i < convo.length) {
    const msg = convo[i];
    const calls =
      msg.role === "assistant" && Array.isArray(msg.tool_calls) ? msg.tool_calls : null;
    if (!calls) {
      i++;
      continue;
    }
    let j = i + 1; // tool result messages nằm ngay sau, mỗi call 1 message theo thứ tự.
    for (const tc of calls) {
      const fn = (tc as { function?: { name?: string; arguments?: unknown } }).function ?? {};
      const toolMsg = convo[j];
      const content = toolMsg && toolMsg.role === "tool" ? toolMsg.content ?? "" : "";
      const result = parseResult(content);
      const isErr =
        !!result &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        "error" in (result as Record<string, unknown>);
      rows.push({
        seq: seq++,
        name: fn.name ?? "",
        args: parseArgs(fn.arguments),
        result,
        ok: !isErr,
        bytes: content.length,
      });
      if (toolMsg && toolMsg.role === "tool") j++;
    }
    i = j;
  }
  return rows;
}
