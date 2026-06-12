// OAuth provider registry. Connectors reference a provider by id in
// auth.provider; the framework and the authorize/callback route resolve the
// implementation here. Trello is NOT a provider (fragment flow — see ./trello.ts).
import type { OAuthProvider } from "./types";
import { googleProvider } from "./google";
import { atlassianProvider } from "./atlassian";
import { slackProvider } from "./slack";
import { zaloProvider } from "./zalo";

export const PROVIDERS: Record<string, OAuthProvider> = {
  google: googleProvider,
  atlassian: atlassianProvider,
  slack: slackProvider,
  zalo: zaloProvider,
};
