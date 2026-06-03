// Explicit connector registry. The bundled app can't fs-scan a directory like
// v1 did, so each connector module is imported here. The `connectors` agent
// fills this array with the 7 modules (demo/github/trello/jira/google-drive/
// google-calendar/gmail).

import type { Connector } from "./types";

export const CONNECTORS: Connector[] = [];
