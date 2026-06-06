// Utility tool family — deterministic helpers (Rule 5: code, not LLM, for exact
// transforms). Registered into INTERNAL_TOOLS alongside laam_* and web_*.
import type { Tool } from "../../types";
import { utilCalc } from "./calc";

export const UTIL_TOOLS: Tool[] = [utilCalc];
