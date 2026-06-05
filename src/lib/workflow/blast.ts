// Blast-radius gate cho connector node trong workflow (v1 = BLAST_LOW-only).
// Áp CẢ manual lẫn scheduled (spec F1 v1-LOW-only): một connector action mà
// resolveKind nói là `write` VÀ resolveBlast nói là `high` → fail-closed THROW.
// Reads qua được; LOW writes (demo_create_task) qua được. Wire vào buildRunNode
// TRƯỚC khi gọi connectorExecute → không có đường nào chạy write blast-cao.
import { resolveKind, resolveBlast } from "@/lib/agent/safety/policy";
import type { Tool } from "@/lib/agent/types";

export function assertConnectorAllowed(action: string, internal: Tool[]): void {
  // Chỉ WRITE mới xét blast; reads luôn cho qua.
  if (resolveKind(action, internal) !== "write") return;
  if (resolveBlast(action) === "high") {
    throw new Error(
      `blast: '${action}' là write blast-radius cao — không cho phép trong workflow v1 (chỉ BLAST_LOW)`,
    );
  }
  // LOW write → qua.
}
