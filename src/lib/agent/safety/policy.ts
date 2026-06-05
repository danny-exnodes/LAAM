// Classify a tool call as read or write so the gate knows whether to require
// confirmation. Internal tools self-declare via Tool.kind. Connector tools have
// no kind → classified by name here. Unknown connector tools FAIL CLOSED (treated
// as write/gated) + warn: a new write can never be silently ungated; worst case a
// new read is gated until added to CONNECTOR_READS. (Spec §3.)
import type { Tool } from "../types";

export const CONNECTOR_WRITES: ReadonlySet<string> = new Set([
  "trello_create_card",
  "demo_create_task", // FEAT-5: credential-free write-gate demo
]);

export const CONNECTOR_READS: ReadonlySet<string> = new Set([
  "demo_list_tasks",
  "github_list_repos",
  "github_list_issues",
  "github_search_issues",
  "trello_list_boards",
  "trello_list_cards",
  "jira_search_issues",
  "jira_my_issues",
  "gdrive_list_files",
  "gdrive_search",
  "gcal_list_events",
  "gmail_list_messages",
  "gmail_search",
]);

export function resolveKind(name: string, internal: Tool[]): "read" | "write" {
  const tool = internal.find((t) => t.name === name);
  if (tool) return tool.kind;
  if (CONNECTOR_WRITES.has(name)) return "write";
  if (CONNECTOR_READS.has(name)) return "read";
  console.warn(`[safety] tool chưa phân loại, mặc định GATE (write): ${name}`);
  return "write";
}
