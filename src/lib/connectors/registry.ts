// Explicit connector registry. The bundled app can't fs-scan a directory like
// v1 did, so each connector module is imported here. 10 connectors:
// demo/github/trello/jira/google-drive/google-calendar/gmail (original 7) +
// slack/whatsapp/zalo (2026-06-12 expansion — see the multiprovider OAuth spec).

import type { Connector } from "./types";
import demo from "./demo";
import github from "./github";
import trello from "./trello";
import jira from "./jira";
import gdrive from "./google-drive";
import gcal from "./google-calendar";
import gmail from "./gmail";
import slack from "./slack";
import whatsapp from "./whatsapp";
import zalo from "./zalo";

export const CONNECTORS: Connector[] = [demo, github, trello, jira, gdrive, gcal, gmail, slack, whatsapp, zalo];
