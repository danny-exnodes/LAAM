// L2 — union schema cho model + một điểm dispatch (route internal↔connector).
// onEvent phát ở đây (chokepoint); L4 đã bọc handler internal qua guard() lúc dựng.
import type { ConnectorTool } from "@/lib/connectors/types";
import { execute } from "@/lib/connectors";
import type { Tool, ToolContext, ToolEvent } from "./types";
import { guard } from "./guardrails";
import { LAAM_TOOLS } from "./tools/laam";
import { WEB_TOOLS } from "./tools/web";
import { UTIL_TOOLS } from "./tools/util";

// Guard 1 lần khi load module → dispatch luôn đi qua validate + bound. Ba họ tool nội bộ:
// laam_* (dữ liệu LAAM) · web_* (đọc/tìm web, self-host $0) · util_* (deterministic).
export const INTERNAL_TOOLS: Tool[] = [...LAAM_TOOLS, ...WEB_TOOLS, ...UTIL_TOOLS].map(guard);

export function modelToolSchemas(internal: Tool[], connectorTools: ConnectorTool[]): ConnectorTool[] {
  const internalSchemas: ConnectorTool[] = internal.map((t) => ({
    type: "function",
    kind: t.kind,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  return [...internalSchemas, ...connectorTools];
}

export function makeDispatch(
  internal: Tool[],
  ctx: ToolContext,
  onEvent?: (e: ToolEvent) => void,
): (name: string, args: unknown) => Promise<unknown> {
  const byName = new Map(internal.map((t) => [t.name, t]));
  return async (name, args) => {
    onEvent?.({ type: "tool_call", name, args });
    let result: unknown;
    let ok = true;
    try {
      const tool = byName.get(name);
      if (tool) {
        // model có thể gửi arguments dạng chuỗi JSON — parse như execute() làm.
        let a: unknown = args;
        if (typeof a === "string") {
          try { a = JSON.parse(a); } catch { a = {}; }
        }
        result = await tool.handler((a ?? {}) as Record<string, unknown>, ctx);
      } else {
        result = await execute(ctx.userId, name, args);
      }
    } catch (e) {
      ok = false;
      result = { error: e instanceof Error ? e.message : String(e) };
    }
    let bytes = 0;
    try { bytes = JSON.stringify(result).length; } catch { bytes = 0; }
    onEvent?.({ type: "tool_result", name, ok, bytes });
    return result;
  };
}
