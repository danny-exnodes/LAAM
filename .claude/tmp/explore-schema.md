## 1. DB Schema: Table Definitions for chat_conversation, chat_message, workflow, connector_credentials, notification, access_token

### Chat Tables (Per-user, userId PK)

**chatConversations** (snake_case SQL: `chat_conversation`):
```typescript
export const chatConversations = pgTable("chat_conversation", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Cuá»™c trÃ² chuyá»‡n má»›i"),
  model: text("model"),
  summary: text("summary"),
  summarizedThroughId: text("summarizedThroughId"),
  proactiveState: jsonb("proactiveState").$type<{ surfaced: Record<string, number> }>(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});
```

**chatMessages** (snake_case SQL: `chat_message`):
```typescript
export const chatMessages = pgTable(
  "chat_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversationId")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    tokensIn: integer("tokensIn").notNull().default(0),
    tokensOut: integer("tokensOut").notNull().default(0),
    attachments: jsonb("attachments").$type<AttachmentMeta[]>(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("chat_message_conversation_created_idx").on(t.conversationId, t.createdAt)],
);
```

### Workflow Tables (Per-user, userId FK)

**workflows** (snake_case SQL: `workflow`):
```typescript
export const workflows = pgTable("workflow", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  graph: jsonb("graph").$type<WorkflowGraph>().notNull(),
  isTemplate: boolean("isTemplate").notNull().default(false),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});
```

**workflowSchedules** (snake_case SQL: `workflow_schedule`):
```typescript
export const workflowSchedules = pgTable("workflow_schedule", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workflowId: text("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cron: text("cron").notNull(),
  timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
  enabled: boolean("enabled").notNull().default(true),
  catchupPolicy: text("catchupPolicy").notNull().default("skip"),
  nextRunAt: timestamp("nextRunAt", { mode: "date" }),
  lastRunAt: timestamp("lastRunAt", { mode: "date" }),
  missedCount: integer("missedCount").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});
```

### Connector & Access Tables (Per-user)

**connectorCredentials** (snake_case SQL: `connector_credential`):
```typescript
export const connectorCredentials = pgTable(
  "connector_credential",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectorId: text("connectorId").notNull(),
    secret: text("secret").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userConnector: unique("connector_user_id").on(t.userId, t.connectorId),
  }),
);
```

**accessTokens** (snake_case SQL: `access_token`, includes 0014 extension):
```typescript
export const accessTokens = pgTable(
  "access_token",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    last4: text("last4").notNull(),
    tokenHash: text("tokenHash").notNull(),
    scopes: jsonb("scopes").$type<string[]>(),
    machineId: text("machineId").references(() => machines.id, {
      onDelete: "cascade",
    }),
    lastUsedAt: timestamp("lastUsedAt", { mode: "date" }),
    expiresAt: timestamp("expiresAt", { mode: "date" }),
    revokedAt: timestamp("revokedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("access_token_hash_key").on(t.tokenHash)],
);
```

**notifications** (snake_case SQL: `notification`, 0013):
```typescript
export const notifications = pgTable(
  "notification",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    audience: text("audience"),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    source: text("source").notNull(),
    readAt: timestamp("readAt", { mode: "date" }),
    dedupeKey: text("dedupeKey"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_user_read_created_idx").on(t.userId, t.readAt, t.createdAt),
    uniqueIndex("notification_user_dedupe_key")
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  ],
);
```

**Key patterns**: camelCase TS fields (userId, createdAt); snake_case SQL (userId, createdAt); onDelete cascade for owned rows; indexes on (userId, createdAt) for per-user listing.

---

## 2. Drizzle Migration Workflow

Migrations 0000-0014 exist. Latest: **0014_overrated_calypso.sql** adds `access_token.createdByUserId`.

**Workflow**: `npm run db:generate` (reads src/db/schema.ts, emits drizzle/<N>.sql + meta snapshot), then `npm run db:push` (applies to live DB) or commit the files.

**Config** (drizzle.config.ts): schema points to src/db/schema.ts, output to ./drizzle, dialect postgresql.

**Gotcha**: In sandbox (no live DB), `db:generate` still worksâ€”it compares your schema to the latest snapshot, not a live DB, so migration SQL is always generated correctly.

---

## 3. Workflow Agent Node Config & Engine Execution

**WfAgentNode** (src/lib/workflow/types.ts):
```typescript
export type WfAgentNode = {
  id: string;
  kind: "agent";
  prompt: string;
  system?: string;
  model?: string;
  format?: Record<string, unknown>;
};
```

**Execution** (src/lib/workflow/executors.ts, runAgentNode function):
- Resolves `node.prompt` via interpolateTemplate with {{steps.x.output}} syntax.
- Uses `node.system ?? DEFAULT_AGENT_SYSTEM` where DEFAULT_AGENT_SYSTEM = "Báº¡n lÃ  má»™t bÆ°á»›c xá»­ lÃ½ trong workflow. Tráº£ lá»i ngáº¯n gá»n, chÃ­nh xÃ¡c, Ä‘Ãºng yÃªu cáº§u cá»§a bÆ°á»›c."
- Calls `deps.callOllama(messages, tools)` directlyâ€”**engine IGNORES node.model** (per spec D-RUNTIME, always uses harness default).
- If node.format set, passes format param to Ollama for structured JSON output.

**customAgentId resolution**: Would happen in the caller (route/CLI) before engine invocationâ€”route loads custom_agent row, injects its system/prompt into the WfAgentNode before passing to runAgentNode().

---

## 4. Chat & System Prompt Touchpoint

No unified buildSystemPrompt function. **Workflow agents** use node.system from executors.ts. **Chat** is agentless in current codebase.

**Integration touchpoint**: If chat gains custom-agent-support, /api/chat would load customAgentId from the conversation row and prepend the agent's system prompt to the messages before orchestration. Out of scope structurally today.

---

## 5. Exemplary Per-User CRUD Route: /api/conversations

**GET** (lines 12â€“55): Auth check â†’ eq(userId) filter â†’ orderBy desc(updatedAt) â†’ return masked JSON.

**PATCH** (lines 48â€“71): Auth + requireMutator gate â†’ ownedConversation ownership check â†’ update title â†’ 200 { ok: true, title }.

**DELETE** (lines 74â€“90): Auth + requireMutator gate â†’ ownedConversation check â†’ delete row â†’ 200 { ok: true }.

**Pattern for custom-agents routes**:
1. Auth check (401 if no session).
2. RBAC gate (requireMutator for POST/PATCH/DELETE; requireRole for admin-only).
3. Ownership check via db.select().where(eq(customAgents.id, id)) â†’ if !row || row.userId !== session.user.id, return 404.
4. Drizzle chains: select().from().where(eq(userId, id)).orderBy() for lists; insert/update/delete standard Drizzle.
5. Error shape: NextResponse.json({error: "msg"}, {status: N}); success: {ok: true, data}.

---

## 6. Settings UI: Where Custom Agents Management Lives

**Current structure**: /settings â†’ SettingsMenu component (src/components/settings/SettingsMenu.tsx) lists grouped settings rows (Account, Servers, Display).

**Recommendation**: Add /settings/custom-agents subpage.
- Create src/app/settings/custom-agents/page.tsx (new).
- Create src/components/settings/CustomAgentsSection.tsx.
- Add SettingsRow link in SettingsMenu.tsx â†’ href="/settings/custom-agents".

**Analog**: src/components/connectors/ConnectorsClient.tsx (list + create/edit/delete pattern); src/components/settings/SettingsMenu.tsx (navigation structure).

---

## 7. API Route Test Pattern

**File**: src/app/api/conversations/route.test.ts

```typescript
import { describe, expect, test, vi, beforeEach } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db/schema", ...)
vi.mock("@/db", ...)
const mockAuth = vi.mocked(auth);
function fakeDb(convRow) { return { db: ..., updates: [] }; }
function req(body) { return new Request(..., { body: JSON.stringify(body) }); }
describe("POST /api/conversations â€” RBAC", () => {
  test("401 unauth â€” no update", async () => {
    mockAuth.mockResolvedValue(null);
    const { db, updates } = fakeDb({ id: "c1", userId: "u1" });
    const res = await POST(req({...}));
    expect(res.status).toBe(401);
    expect(updates).toHaveLength(0);
  });
  test("viewer â†’ 403, no update", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "viewer" } });
    const res = await POST(req({...}));
    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
  });
});
```

**Key patterns**: Mock auth() + db chains; test auth gates first (401, 403); verify no DB mutations for read-only viewers; test ownership enforcement (userId mismatch â†’ 404); test schema validation (missing fields â†’ 400).