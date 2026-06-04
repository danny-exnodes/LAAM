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
  help?: string;
  setup?: string;
  fields?: ConnectorField[];
};

export type ConnectorTool = {
  type: "function";
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

// Browser-safe projection of a connector (NO raw secrets — masked hints only).
export type ConnectorListItem = {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  auth: {
    type: string;
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
  connected: boolean;
  connectedAt: string | null;
};
