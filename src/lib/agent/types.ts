// Hợp đồng đóng băng cho Agent Harness. SP-2/3/4 trích dẫn file này.
import type { ConnectorTool } from "@/lib/connectors/types";

export type ToolContext = {
  userId: string;
  now: number; // epoch ms, inject để test ổn định
  lang: string; // 'vi' | 'en' | 'zh'
};

export type ToolKind = "read" | "write";

export type Tool = {
  name: string; // tiền tố 'laam_'
  description: string;
  parameters: object; // JSON schema {type:'object', properties, required?}
  kind: ToolKind;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

export type ToolEvent =
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; ok: boolean; bytes: number };

export type { ConnectorTool };
