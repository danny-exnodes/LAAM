import type { GraderResult, RunTrace, Scenario } from "../types";
import { gradeToolSelection } from "./tool-selection";
import { gradeRestraint } from "./restraint";
import { gradeArgs } from "./args";
import { gradeGrounding } from "./grounding";
import { gradeTermination } from "./termination";
import { gradeRichBlock } from "./rich-block";
import { gradeWriteIntent } from "./write-intent";
import { gradeCitesRealUrl } from "./cites-real-url";

// Chấm CHỈ những chiều mà scenario.expect khai báo (scenario thưa, không ép đủ 7 chiều).
export function runGraders(trace: RunTrace, s: Scenario): GraderResult[] {
  const e = s.expect;
  const out: GraderResult[] = [];
  if (e.callsTool !== undefined) out.push(gradeToolSelection(trace, e.callsTool));
  if (e.notCalls !== undefined) out.push(gradeRestraint(trace, e.notCalls));
  if (e.args !== undefined) out.push(gradeArgs(trace, e.args));
  if (e.finalContains !== undefined || e.finalNotContains !== undefined) out.push(gradeGrounding(trace, e));
  if (e.citesRealUrl !== undefined) out.push(gradeCitesRealUrl(trace, e.citesRealUrl)); // Rule 13 cho URL → dim grounding
  if (e.maxRounds !== undefined) out.push(gradeTermination(trace, e.maxRounds));
  if (e.emitsBlock !== undefined) out.push(gradeRichBlock(trace, e.emitsBlock));
  // write-intent: chấm khi capability của scenario là write-intent (callsTool = write-tool).
  if (s.capability === "write-intent" && typeof e.callsTool === "string") out.push(gradeWriteIntent(trace, e.callsTool));
  return out;
}
