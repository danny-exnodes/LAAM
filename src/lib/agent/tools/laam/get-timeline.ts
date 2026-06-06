import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { getTimeline } from "@/lib/monitoring/parser.js";
import { getLocalTimeline } from "@/lib/monitoring/localParser.js";
import type { Tool } from "../../types";

const MAX_EVENTS = 25;

// Keep only the last N events (the recent tail is what matters for "what is it doing
// now"), but report the true total so the model knows it is a tail. Bounded so the
// result stays under the guard's 8192-byte output cap.
export function shapeTimeline(events: unknown[], max = MAX_EVENTS) {
  const total = events.length;
  return { total, truncated: total > max, events: total > max ? events.slice(-max) : events };
}

export const getTimelineTool: Tool = {
  name: "laam_get_timeline",
  description:
    "Lấy dòng thời gian (message + lượt tool) của một phiên agent theo id. " +
    "Chỉ khả dụng cho phiên trên máy host (đọc transcript trực tiếp); phiên từ máy khác trả rỗng.",
  kind: "read",
  parameters: {
    type: "object",
    properties: { id: { type: "string", description: "id phiên agent" } },
    required: ["id"],
  },
  async handler(args) {
    const id = String(args.id ?? "");
    const rows = await db
      .select({ transcriptPath: agentSessions.transcriptPath, source: agentSessions.source })
      .from(agentSessions)
      .where(eq(agentSessions.id, id))
      .limit(1);
    const s = rows[0];
    if (!s) return { error: "không tìm thấy agent: " + id };
    if (!s.transcriptPath) {
      return { events: [], total: 0, truncated: false, note: "host-only: phiên này không có transcript trên máy hiện tại" };
    }
    let events: unknown[] = [];
    try {
      events = (s.source === "local" ? getLocalTimeline(s.transcriptPath) : getTimeline(s.transcriptPath)) as unknown[];
    } catch {
      return { events: [], total: 0, truncated: false, note: "không đọc được transcript (có thể đã xoay/di chuyển)" };
    }
    return shapeTimeline(events);
  },
};
