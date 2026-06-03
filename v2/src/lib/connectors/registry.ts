// Explicit connector registry. The bundled app can't fs-scan a directory like
// v1 did, so each connector module is imported here. The `connectors` agent
// fills this array with the 7 modules (demo/github/trello/jira/google-drive/
// google-calendar/gmail).

import type { Connector } from "./types";
import demo from "./demo";
import github from "./github";
import trello from "./trello";
import jira from "./jira";
import gdrive from "./google-drive";
import gcal from "./google-calendar";
import gmail from "./gmail";

export const CONNECTORS: Connector[] = [demo, github, trello, jira, gdrive, gcal, gmail];
