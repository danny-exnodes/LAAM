import type { Tool } from "../../types";
import { listAgents } from "./list-agents";
import { getAgent } from "./get-agent";
import { queryStats } from "./query-stats";
import { listMachines } from "./list-machines";
import { findStuck } from "./find-stuck";
import { searchSessions } from "./search-sessions";
import { getTimelineTool } from "./get-timeline";
import { queryAudit } from "./query-audit";

export const LAAM_TOOLS: Tool[] = [
  listAgents,
  getAgent,
  queryStats,
  listMachines,
  findStuck,
  searchSessions,
  getTimelineTool,
  queryAudit,
];
