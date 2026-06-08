import { CONNECTORS } from "@/lib/connectors/registry";
import type { ConnectorTool } from "@/lib/connectors/types";
import { INTERNAL_TOOLS, modelToolSchemas } from "@/lib/agent/registry";

// Schema connector THẬT (mọi connector, mọi tool) — distractor "giống thật" cho selection-at-scale
// (bloat thật = nhiều tool mô tả na ná, không phải nhiễu ngẫu nhiên). Chỉ ĐỌC registry, không sửa.
export function allConnectorSchemas(): ConnectorTool[] {
  return CONNECTORS.flatMap((c) => c.tools);
}

// Union kích thước N: luôn giữ `correct` (đáp án), đệm `distractors` (loại trùng tên correct) tới đủ N.
export function padToN(correct: ConnectorTool[], distractors: ConnectorTool[], n: number): ConnectorTool[] {
  const names = new Set(correct.map((c) => c.function.name));
  const pad = distractors.filter((d) => !names.has(d.function.name)).slice(0, Math.max(0, n - correct.length));
  return [...correct, ...pad];
}

// Tra schema THẬT cho 1 probe theo tên — internal trước (qua registry), rồi connector. Bỏ special-case `trello_`.
export function resolveProbeSchema(name: string): ConnectorTool {
  const internal = INTERNAL_TOOLS.find((t) => t.name === name);
  if (internal) return modelToolSchemas([internal], [])[0];
  const conn = allConnectorSchemas().find((t) => t.function.name === name);
  if (conn) return conn;
  throw new Error(`probe tool not found in registry: ${name}`);
}

export function resolveProbeSchemas(names: string[]): ConnectorTool[] {
  return names.map(resolveProbeSchema);
}
