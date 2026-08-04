// Pool distractor từ tool MCP THẬT (fixture chụp bằng snapshot-mcp-pool.ts).
//
// WHY: production đưa cho model 60 tool, 48 trong đó là MCP với JSON Schema thật. Pool cũ
// (`allConnectorSchemas`) chỉ có connector built-in nên không dựng lại được điều kiện đó —
// đường cong "chọn tool theo số lượng tool" vì thế mới dừng ở 16.
import { readFileSync } from "node:fs";
import type { ConnectorTool } from "@/lib/connectors/types";

// Đường dẫn tương đối từ gốc repo — cùng quy ước với suite.scale.eval.ts (".serena/qa").
const DEFAULT_POOL_PATH = "scripts/eval/scale/mcp-pool.json";

// Fail-soft: thiếu fixture chỉ làm eval chạy ở scale nhỏ (và nói rõ ra), không làm hỏng suite.
export function loadMcpPool(path: string = DEFAULT_POOL_PATH): ConnectorTool[] {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ConnectorTool[]) : [];
  } catch {
    console.warn(`[eval] không đọc được ${path} — chạy KHÔNG có distractor MCP. Chụp lại: npx tsx --env-file=.env scripts/eval/scale/snapshot-mcp-pool.ts <userId>`);
    return [];
  }
}

// Tra schema của một probe qua nhiều pool (internal → connector → MCP). Không tìm thấy thì
// NÉM: probe trỏ sai tên tool phải đỏ ngay, không được im lặng đo một thứ khác.
export function resolveFromPools(name: string, pools: ConnectorTool[][]): ConnectorTool {
  for (const pool of pools) {
    const hit = pool.find((t) => t.function.name === name);
    if (hit) return hit;
  }
  throw new Error(`probe tool không có trong pool nào: ${name}`);
}
