// THUẦN, server-side. Redact args + suy citations từ convo + gom frame.
import type { ChatFrame } from "./frames";
import type { ChatMessage } from "@/lib/agent/orchestrator";
import type { ToolEvent } from "@/lib/agent/types";

// Tóm tắt args để hiển thị. Internal (set-membership): key=value an toàn. Connector: KHÔNG
// hiện giá trị (có thể chứa cred — D-SP4-3) → chỉ báo số tham số.
export function summarizeArgs(rawArgs: unknown, isInternal: boolean): string | undefined {
  let a: unknown = rawArgs;
  if (typeof a === "string") { try { a = JSON.parse(a); } catch { return undefined; } }
  if (!a || typeof a !== "object") return undefined;
  const obj = a as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return undefined;
  if (!isInternal) return `${keys.length} tham số`;
  return keys.slice(0, 4).map((k) => `${k}=${String(obj[k])}`).join(", ");
}

// "Nguồn": tool có result KHÔNG có key `error` và KHÔNG rỗng. Đọc convo runToolRounds trả:
// assistant{tool_calls:[…]} theo sau bởi các message role:'tool' (1 result / call, đúng thứ tự).
export function deriveCitations(convo: ChatMessage[], baseLen: number): string[] {
  const names: string[] = [];
  const tail = convo.slice(baseLen);
  for (let i = 0; i < tail.length; i++) {
    const calls = (tail[i] as { tool_calls?: unknown[] }).tool_calls;
    if (tail[i].role !== "assistant" || !Array.isArray(calls)) continue;
    let j = i + 1;
    for (const tc of calls) {
      const toolMsg = tail[j];
      if (!toolMsg || toolMsg.role !== "tool") break;
      const name = (tc as { function?: { name?: string } }).function?.name ?? "";
      if (name && hasData(toolMsg.content)) names.push(name);
      j++;
    }
  }
  return [...new Set(names)];
}

function hasData(content: string): boolean {
  let v: unknown;
  try { v = JSON.parse(content); } catch { return content.trim().length > 0; }
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return !("error" in (v as object)) && Object.keys(v as object).length > 0;
  return true;
}

// Gom tool frames từ onEvent: gán bộ đếm `c` theo cặp call→result (phát tuần tự — D-SP4-5),
// redact args theo set-membership internal. THUẦN (mảng `frames` mutate tại chỗ).
export function makeFrameCollector(internalNames: Set<string>): {
  onEvent: (e: ToolEvent) => void;
  frames: ChatFrame[];
} {
  const frames: ChatFrame[] = [];
  let c = -1;
  return {
    frames,
    onEvent(e) {
      if (e.type === "tool_call") {
        c++;
        frames.push({ t: "tool", phase: "call", c, name: e.name, args: summarizeArgs(e.args, internalNames.has(e.name)) });
      } else {
        frames.push({ t: "tool", phase: "result", c, name: e.name, ok: e.ok });
      }
    },
  };
}
