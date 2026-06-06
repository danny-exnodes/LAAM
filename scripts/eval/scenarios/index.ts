import type { Scenario } from "../types";
import { stuckBasic, tokensToday, agentDetail, machinesOnline } from "./read-tools";
import { greeting, chitchat } from "./restraint";
import { geoDirections, chartRender } from "./rich-render";
import { writeIntentTrello } from "./write-gate";
import { loopGuard } from "./termination";
import { webResearch, webRestraint } from "./web";
import { utilCalcSum } from "./util";
import { searchSessions, getTimeline, queryAudit } from "./laam-extra";

export const ALL_SCENARIOS: Scenario[] = [
  stuckBasic, tokensToday, agentDetail, machinesOnline,
  greeting, chitchat, geoDirections, chartRender, writeIntentTrello, loopGuard,
  // E1 (world-tools coverage)
  webResearch, webRestraint, utilCalcSum, searchSessions, getTimeline, queryAudit,
];
