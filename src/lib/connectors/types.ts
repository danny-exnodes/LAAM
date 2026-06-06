// Connector framework — LOCKED contracts (Wave 4 TL prep).
//
// A connector exposes TOOLS the chat model can call. When the model emits a
// tool_call, the chat loop runs the matching handler with the user's stored
// (decrypted) credentials and feeds the real result back to the model.
// Credentials are stored server-side ONLY, encrypted at rest, per-user, and are
// NEVER returned to the browser in clear (always masked).

export type ConnectorField = {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
};

export type ConnectorAuth = {
  type: "token" | "oauth" | "none";
  // OAuth (in-app redirect flow). `provider` selects the OAuth implementation;
  // `scopes` are requested at consent time for THIS connector (least-privilege:
  // each connector grants only what it needs).
  provider?: "google";
  scopes?: string[];
  help?: string;
  setup?: string;
  fields?: ConnectorField[];
};

export type ConnectorTool = {
  type: "function";
  // Self-declared read/write. The safety policy (resolveKind) derives a tool's
  // classification from THIS — single source of truth, so adding a tool touches
  // one connector file and can never drift out of sync with a central name-list.
  kind: "read" | "write";
  function: { name: string; description: string; parameters: object };
};

export type Connector = {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  auth: ConnectorAuth;
  tools: ConnectorTool[];
  handlers: Record<
    string,
    (args: Record<string, unknown>, creds: Record<string, string>) => Promise<unknown>
  >;
  test?: (creds: Record<string, string>) => Promise<{ ok: boolean; info?: string; error?: string }>;
};

// Tri-state connection status. `needs_reconnect` only applies to OAuth: the grant
// existed but its refresh token was revoked / expired (Google "Testing" apps drop
// refresh tokens after ~7 days) — the UI shows a one-click "Reconnect".
export type ConnectorStatus = "connected" | "needs_reconnect" | "disconnected";

// Browser-safe projection of a connector (NO raw secrets — masked hints only).
export type ConnectorListItem = {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  auth: {
    type: string;
    provider: string;
    scopes: string[];
    help: string;
    setup: string;
    fields: {
      key: string;
      label: string;
      placeholder: string;
      secret: boolean;
      set: boolean;
      masked: string;
    }[];
  };
  tools: string[];
  status: ConnectorStatus;
  // Back-compat convenience: connected === (status === "connected").
  connected: boolean;
  // Display-only account hint for OAuth connectors (e.g. the linked Google email).
  account: string | null;
  connectedAt: string | null;
};
