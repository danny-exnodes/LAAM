// Web/knowledge tool family — read the open web ($0, self-host). web_search (SearXNG)
// finds, web_read fetches a URL's text. Registered into INTERNAL_TOOLS alongside the
// laam_* and util_* families.
import type { Tool } from "../../types";
import { webSearch } from "./search";
import { webRead } from "./read";

export const WEB_TOOLS: Tool[] = [webSearch, webRead];
