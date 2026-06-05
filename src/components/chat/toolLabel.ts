// Nhãn thân thiện cho trace/citations (mỹ thuật, client-side — D-SP4-3: lệch nhãn ≠ rò).
// 5 internal tool map sang key i18n; connector → humanize tên thô.
import type { Translator } from "@/i18n/types";

// 1 item trace đã ghép call↔result theo `c` (ChatClient dựng từ frames).
export type ToolTraceItem = {
  c: number;
  name: string;
  args?: string;
  ok?: boolean;   // chỉ có khi done
  done: boolean;  // result frame đã tới
};

const TOOL_LABEL_KEY: Record<string, string> = {
  laam_list_agents: "chat.toolListAgents",
  laam_get_agent: "chat.toolGetAgent",
  laam_query_stats: "chat.toolQueryStats",
  laam_list_machines: "chat.toolListMachines",
  laam_find_stuck: "chat.toolFindStuck",
};

export function toolLabel(name: string, t: Translator): string {
  const key = TOOL_LABEL_KEY[name];
  return key ? t(key) : name.replace(/_/g, " ");
}
