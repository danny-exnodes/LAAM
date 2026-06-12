
## 1. src/lib/agent/registry.ts â€” Tool definition type & INTERNAL_TOOLS listing

**Tool definition type** (from src/lib/agent/types.ts, lines 12â€“18):
```typescript
export type Tool = {
  name: string; // tiá»n tá»‘ 'laam_'
  description: string;
  parameters: object; // JSON schema {type:'object', properties, required?}
  kind: ToolKind;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

export type ToolKind = "read" | "write";
```

**How internal tools are listed** (src/lib/agent/registry.ts, line 13):
```typescript
export const INTERNAL_TOOLS: Tool[] = [...LAAM_TOOLS, ...WEB_TOOLS, ...UTIL_TOOLS].map(guard);
```

**Exact set of internal tool names** (as of repo):
- **LAAM_TOOLS** (8): `laam_list_agents`, `laam_get_agent`, `laam_query_stats`, `laam_list_machines`, `laam_find_stuck`, `laam_search_sessions`, `laam_get_timeline`, `laam_query_audit`
- **WEB_TOOLS** (2): `web_search`, `web_read`
- **UTIL_TOOLS** (1): `util_calc`

Total: **11 internal tools**, all prefixed laam_/web_/util_.

---

## 2. src/lib/connectors/index.ts â€” chatTools() + execute() routing + mcpReadAllow

**Function signatures & return types** (src/lib/connectors/index.ts, lines 191â€“204):
```typescript
// Tools of every CONNECTED connector for this user, to pass to the model.
export async function chatTools(userId: string): Promise<ConnectorTool[]> {
  const out: ConnectorTool[] = [];
  for (const def of CONNECTORS) {
    if (await isConnected(userId, def.id)) out.push(...def.tools);
  }
  // MCP servers (per-user, dynamic). Best-effort: a down server yields no tools.
  try {
    const { tools } = await discoverForUser(userId);
    out.push(...tools);
  } catch {
    /* MCP discovery failure must not break chat tool listing */
  }
  return out;
}

export async function execute(userId: string, toolName: string, args: unknown): Promise<unknown> {
  if (toolName.startsWith("mcp__")) return executeMcp(userId, toolName, args);
  // ... routes to connector handler
}
```

**execute() routing** (lines 244â€“246):
- If `toolName.startsWith("mcp__")`, route to `executeMcp()` which extracts slug & real name from route map
- Otherwise, look up tool in `TOOL_OWNER` map, fetch creds, and call connector handler

**mcpReadAllow definition** (lines 208â€“214):
```typescript
// Names of MCP tools the user opted to trust as read (fed to the safety gate's
// readAllow so they skip the write confirm-card). Everything else stays fail-closed.
export async function mcpReadAllow(userId: string): Promise<ReadonlySet<string>> {
  try {
    return (await discoverForUser(userId)).readAllow;
  } catch {
    return new Set();
  }
}
```
**What it is**: A `ReadonlySet<string>` of MCP tool names (namespaced as `mcp__<slug>__<tool>`) that the user has opted to trust as read-only via `trustReadHints: true` on the server config AND the tool declares `readOnlyHint === true`.

---

## 3. src/lib/connectors/mcp/*.ts â€” MCP types, store, client, discovery

### **McpServerConfig type** (src/lib/connectors/mcp/types.ts, lines 9â€“15):
```typescript
export type McpServerConfig = {
  slug: string;
  name: string;
  url: string;
  authToken?: string;
  trustReadHints: boolean;
};
```

### **discoverForUser() signature & return type** (src/lib/connectors/mcp/discovery.ts, lines 30â€“70):
```typescript
export type DiscoveryResult = {
  tools: ConnectorTool[];
  readAllow: Set<string>;
  route: Map<string, { slug: string; realName: string }>;
};

export async function discoverForUser(userId: string): Promise<DiscoveryResult> {
  // 30s cache (TTL_MS = 30_000, line 19)
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;
  
  // Fetch all user's MCP servers via listServers()
  const servers = await listServers(userId);
  for (const cfg of servers) {
    const remoteTools = await listTools(cfg);
    for (const t of remoteTools) {
      const name = NS + cfg.slug + "__" + t.name;  // "mcp__<slug>__<tool>"
      // FAIL-CLOSED: read only when trusted AND explicitly hinted read-only
      const kind: "read" | "write" =
        cfg.trustReadHints && t.annotations?.readOnlyHint === true ? "read" : "write";
      tools.push({ type: "function", kind, function: { name, description, parameters } });
      if (kind === "read") readAllow.add(name);
      route.set(name, { slug: cfg.slug, realName: t.name });
    }
  }
  cache.set(userId, { at: Date.now(), result });
  return result;
}
```

### **Namespacing scheme** (line 49):
```typescript
const name = NS + cfg.slug + "__" + t.name;  // NS = "mcp__"
```
Format: `mcp__<slug>__<realToolName>` (e.g., `mcp__claude_server__get_git_repos`)

### **Cache invalidation** (lines 72â€“74):
```typescript
export function invalidateUser(userId: string): void {
  cache.delete(userId);
}
```

### **How server-side code lists MCP servers + their tools for a user**:
```typescript
// Servers only:
const servers = await listServers(userId);  // Promise<McpServerConfig[]>

// Servers with their tools (via discovery):
const discovery = await discoverForUser(userId);  // Promise<DiscoveryResult>
// discovery.tools: ConnectorTool[] (namespaced, classified)
// discovery.route: Map<namespaced_name, {slug, realName}>
```

---

## 4. API routes response shapes

### **GET /api/connectors** (src/app/api/connectors/route.ts, line 12):
```typescript
return NextResponse.json({ connectors: await list(session.user.id) });
```

**ConnectorListItem shape** (src/lib/connectors/types.ts, lines 69â€“96):
```typescript
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
  tools: ConnectorToolInfo[];  // with name, description, parameters
  status: ConnectorStatus;
  connected: boolean;
  account: string | null;
  connectedAt: string | null;
};

export type ConnectorToolInfo = { name: string; description: string; parameters: object };
```

### **GET /api/connectors/mcp** (src/app/api/connectors/mcp/route.ts, lines 29â€“38):
```typescript
return NextResponse.json({
  servers: servers.map((s) => ({
    slug: s.slug,
    name: s.name,
    url: s.url,
    hasToken: !!s.authToken,
    trustReadHints: s.trustReadHints,
    tools: toolsBySlug[s.slug] ?? [],  // array of namespaced tool names
  })),
});
```

### **GET /api/chat/info** (src/app/api/chat/info/route.ts, lines 17â€“21):
```typescript
return NextResponse.json({
  model: MODEL,
  claudeModels: process.env.ANTHROPIC_API_KEY ? [...CLAUDE_MODELS] : [],
});
```

### **Is there an endpoint that lists INTERNAL tools to the client?**
**No.** INTERNAL_TOOLS are server-only (src/app/api/chat/route.ts, line 318 uses them internally to build the model's tool list). They are never exposed to the browser. The /api/connectors endpoint returns only connected CONNECTOR tools, not internal tools.

---

## 5. JSON-schema of tool parameters & parseArgSchema utility

**Tool parameters shape**: Plain **JSON Schema** object conforming to JSON Schema draft-7/2020-12. Example from util_calc (src/lib/agent/tools/util/calc.ts, lines 127â€“130):
```typescript
parameters: {
  type: "object",
  properties: { expr: { type: "string", description: "biá»ƒu thá»©c sá»‘ há»c cáº§n tÃ­nh" } },
  required: ["expr"],
},
```

**parseArgSchema signature & location** (src/components/workflows/editor/schemaForm.ts, lines 25â€“52):
```typescript
export function parseArgSchema(schema: unknown): ParsedArgSchema {
  // ... flatten JSON Schema into renderable form fields (scalar/enum only)
}

export type ParsedArgSchema = {
  fields: ArgField[];  // renderable (string|number|boolean|enum) properties, in order
  propCount: number;   // total properties declared in schema
  flat: boolean;       // true âŸº every property is renderable (no raw JSON needed)
};

export type ArgField = {
  key: string;
  kind: ArgFieldKind;  // "string" | "number" | "boolean" | "enum"
  description?: string;
  required: boolean;
  enumValues?: string[];  // present iff kind === "enum"
};
```

**What it does**: Extracts `required` from schema.required[], parses each property's type (string/number/boolean/enum), and returns an array of form-renderable fields. Returns `flat: false` if any property is complex (nested object, array, unknown type).

---

## 6. resolveKind / withSafety / readAllow â€” 5-line explanation

**resolveKind()** (src/lib/agent/safety/policy.ts, lines 16â€“31):
```typescript
export function resolveKind(
  name: string,
  internal: Tool[],
  readAllow?: ReadonlySet<string>,
): "read" | "write" {
  const tool = internal.find((t) => t.name === name);
  if (tool) return tool.kind;  // internal: use self-declared kind
  const k = CONNECTOR_KIND.get(name);
  if (k) return k;  // connector: use self-declared kind (from CONNECTORS registry)
  if (readAllow?.has(name)) return "read";  // MCP: only read if user trusts this server's hints
  console.warn(`[safety] tool chÆ°a phÃ¢n loáº¡i, máº·c Ä‘á»‹nh GATE (write): ${name}`);
  return "write";  // FAIL-CLOSED: unknown tools default to write (gated)
}
```

**withSafety()** (src/lib/agent/safety/gate.ts, lines 46â€“59):
```typescript
export function withSafety(
  inner: (name: string, args: unknown) => Promise<unknown>,
  opts: SafetyOptions,  // { internal, confirmedAction?, readAllow? }
): (name: string, args: unknown) => Promise<unknown> {
  return async (name, args) => {
    const kind = resolveKind(name, opts.internal, opts.readAllow);
    const confirmed = opts.confirmedAction?.name === name;
    if (kind === "write" && !confirmed) {
      throw new PendingWriteSignal(name, parseArgs(args));  // suspend turn
    }
    const result = await inner(name, args);
    return redact(boundOutput(result));  // redact + bound the result
  };
}
```

**How kind read/write is decided** (in 5 lines):
1. **Internal tools**: Self-declared kind (read/write) in Tool.kind.
2. **Connector tools**: Self-declared kind in ConnectorTool.kind; derived at load-time into CONNECTOR_KIND static map.
3. **MCP tools**: FAIL-CLOSED to write unless user opted to trust server's hints (trustReadHints=true) AND tool declares readOnlyHint=true â†’ added to readAllow set.
4. **Unknown tools**: Default to write (fail-closed), logged as unclassified.
5. **Write enforcement**: If kind="write" and no confirmedAction match, throw PendingWriteSignal to suspend chat turn.

---

## 7. Demo connector â€” definition & safety for write-gate tests

**Location & definition** (src/lib/connectors/demo.ts, lines 12â€“66):
```typescript
const demo: Connector = {
  id: "demo",
  name: "Demo (dá»¯ liá»‡u máº«u)",
  icon: "database",
  blurb: "Connector máº«u Ä‘á»ƒ thá»­ tool-calling â€” khÃ´ng cáº§n credential",
  auth: { type: "none", help: "... dá»¯ liá»‡u máº«u cá»‘ Ä‘á»‹nh ..." },
  tools: [
    {
      type: "function",
      kind: "read",
      function: {
        name: "demo_list_tasks",
        description: "Liá»‡t kÃª cÃ´ng viá»‡c/Ä‘áº§u viá»‡c máº«u ...",
        parameters: { ... },
      },
    },
    {
      type: "function",
      kind: "write",
      workflowSafe: true,  // â† THE KEY: credential-free demo write
      function: {
        name: "demo_create_task",
        description: "Táº¡o má»™t cÃ´ng viá»‡c/Ä‘áº§u viá»‡c máº«u má»›i...",
        parameters: { ... },
      },
    },
  ],
  handlers: {
    async demo_list_tasks(args) { ... },
    async demo_create_task(args) {
      const title = typeof args.title === "string" ? args.title.trim() : "";
      if (!title) return { error: "cáº§n tÃªn cÃ´ng viá»‡c" };
      const status = typeof args.status === "string" ? args.status : "todo";
      const created = { id: `T-${...}`, title, status, due: "", assignee: "me" };
      return { created };  // not persisted, just echoed
    },
  },
};
```

**What makes it safe for write-gate tests** (line 34):
- **No credentials required** (auth: { type: "none" }) â†’ always connected offline
- **demo_create_task** self-declares `kind: "write"` and `workflowSafe: true`
- **Not persisted**: returns a synthetic task object, never touches the database
- **Deterministic**: same args always yield same output (pure function)
- **Demonstrates full write-gate flow**: model proposes create_task â†’ safety gate throws PendingWriteSignal â†’ UI shows confirm card â†’ user approves â†’ gate re-runs with confirmedAction â†’ tool executes

This is the **only write tool** marked `workflowSafe:true` in the codebase (line 34 comment: "the one tool workflow-cleared in v1"), making it safe for autonomous workflow testing without real side effects.
