// Chụp SCHEMA THẬT của các tool MCP đang cắm vào một user → fixture cho eval scale.
//
// WHY: pool distractor cũ (`allConnectorSchemas`) chỉ có connector built-in, tối đa ~16
// tool — trong khi production hiện đưa cho model 60 tool, 48 trong số đó đến từ MCP với
// JSON Schema thật (thường lớn và na ná nhau). Đo "chọn tool ở quy mô thật" mà thiếu 48
// tool đó thì đo sai điều kiện.
//
// Chạy TAY, host-only (cần DB + MCP server sống):
//   npx tsx --env-file=.env scripts/eval/scale/snapshot-mcp-pool.ts <userId>
// Kết quả ghi ra mcp-pool.json (fixture tĩnh) để eval chạy lại được mà không cần MCP sống.
import { writeFile } from "node:fs/promises";
import { discoverForUser } from "@/lib/connectors/mcp/discovery";

// Tương đối từ gốc repo (chạy: npx tsx ... từ thư mục gốc) — cùng quy ước với eval suite.
const POOL_PATH = "scripts/eval/scale/mcp-pool.json";

async function main() {
  const userId = process.argv[2];
  if (!userId) throw new Error("thiếu userId: npx tsx --env-file=.env scripts/eval/scale/snapshot-mcp-pool.ts <userId>");
  const { tools } = await discoverForUser(userId);
  if (!tools.length) throw new Error("user này không có tool MCP nào — kiểm tra connector trước khi chụp");
  await writeFile(POOL_PATH, JSON.stringify(tools, null, 2) + "\n", "utf8");
  console.log(`đã chụp ${tools.length} tool MCP → ${POOL_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
