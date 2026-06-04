import type { Tool } from "../../types";
import { listAgents } from "./list-agents";
import { getAgent } from "./get-agent";
import { queryStats } from "./query-stats";
import { listMachines } from "./list-machines";
import { findStuck } from "./find-stuck";

export const LAAM_TOOLS: Tool[] = [listAgents, getAgent, queryStats, listMachines, findStuck];
