import { INTERNAL_TOOLS, modelToolSchemas } from "@/lib/agent/registry";
import type { ConnectorTool } from "@/lib/connectors/types";
import type { Scenario } from "./types";

// Dùng đúng builder union của prod để model thấy schema giống thật (kể cả "schema bloat").
// extraToolSchemas: tool chưa-có-ở-prod (geo) hoặc connector (trello) cho ca tương ứng.
export function unionToolSchemas(s: Scenario): ConnectorTool[] {
  return modelToolSchemas(INTERNAL_TOOLS, s.extraToolSchemas ?? []);
}
