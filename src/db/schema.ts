// LAAM v2 — database schema (Drizzle / PostgreSQL).
//
// Phase 1 covers AUTH + RBAC only. The monitoring (machines / agent_sessions /
// events), chat (chat_conversations / chat_messages) and connector_credentials
// tables arrive in later phases (see ../../README.md and docs/v2-plan.md).
//
// The user/account/session/verificationToken tables follow the @auth/drizzle-adapter
// PostgreSQL convention so Auth.js can manage them directly.

import {
  pgTable,
  pgEnum,
  text,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  primaryKey,
  unique,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { WorkflowGraph } from "@/lib/workflow/types";

/** Role-based access control. Single internal org → roles, not multi-tenant. */
export const roleEnum = pgEnum("role", ["owner", "admin", "member", "viewer"]);

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Credentials login (bcrypt hash). Null for OAuth-only accounts.
  passwordHash: text("passwordHash"),
  role: roleEnum("role").notNull().default("member"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

/** Minimal audit trail (who did what) — grows as features land. */
export const auditLog = pgTable("audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Monitoring (Phase 2). One machine = one host running an agent/collector.
// agent_sessions are summaries upserted from parsed Claude transcripts (and,
// later, local-model logs). Full per-event timeline arrives with Session detail.
// ---------------------------------------------------------------------------

export const machines = pgTable("machine", {
  id: text("id").primaryKey(), // deterministic, e.g. "local:<hostname>"
  name: text("name").notNull(),
  hostname: text("hostname"),
  ownerUserId: text("ownerUserId").references(() => users.id, {
    onDelete: "set null",
  }),
  // sha256 of the machine token used by the remote collector to authenticate
  // to POST /api/ingest. Null for the auto-created local host machine.
  tokenHash: text("tokenHash"),
  lastSeen: timestamp("lastSeen", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const projects = pgTable("project", {
  id: text("id").primaryKey(), // deterministic, e.g. "proj:<cwd>"
  encodedCwd: text("encodedCwd").notNull(),
  name: text("name").notNull(),
  cwd: text("cwd"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const agentSessions = pgTable(
  "agent_session",
  {
    id: text("id").primaryKey(), // Claude sessionId (stable across re-syncs)
    machineId: text("machineId").references(() => machines.id, {
      onDelete: "cascade",
    }),
    projectId: text("projectId").references(() => projects.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull().default("claude"), // claude | local | api | mcp
    // Principal for externally-driven sessions (source api|mcp): the access_token's
    // owner. NULL for transcript-derived rows (claude|local) — those are org-shared
    // anyway (provenance, NOT a visibility key; see machines-decomposition Q2).
    userId: text("userId").references(() => users.id, { onDelete: "set null" }),
    model: text("model"),
    gitBranch: text("gitBranch"),
    status: text("status"), // running | idle | done
    startedAt: timestamp("startedAt", { mode: "date" }),
    lastActivity: timestamp("lastActivity", { mode: "date" }),
    messageCount: integer("messageCount").notNull().default(0),
    toolCount: integer("toolCount").notNull().default(0),
    subAgentCount: integer("subAgentCount").notNull().default(0),
    costUsd: doublePrecision("costUsd").notNull().default(0),
    latestActivity: text("latestActivity"),
    tokensIn: integer("tokensIn").notNull().default(0),
    tokensOut: integer("tokensOut").notNull().default(0),
    // Rich per-session data for Graph / charts (populated from the parser).
    subAgents: jsonb("subAgents").$type<SubAgentJson[]>(),
    tools: jsonb("tools").$type<ToolJson[]>(),
    histo: jsonb("histo").$type<Record<string, number>>(), // "<dow>_<hour>" -> count
    // Host path to the source .jsonl — lets the Session-detail page re-read the
    // live timeline (single-host Phase 2; the collector will push events later).
    transcriptPath: text("transcriptPath"),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  // Read paths: sync upsert + dashboard list (machine, recency), per-project /
  // per-status / per-source filters, principal lookups (read-model visibility).
  (t) => [
    index("agent_session_machine_updated_idx").on(t.machineId, t.updatedAt),
    index("agent_session_project_idx").on(t.projectId),
    index("agent_session_status_idx").on(t.status),
    index("agent_session_source_idx").on(t.source),
    index("agent_session_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Access tokens (P0 Access spine) — unified credential for non-interactive
// callers. Generalizes the old machine/collector token (machines.tokenHash,
// kept during the forward-compat transition) into one model with a `kind`
// discriminator so MCP-server + per-user API plug in without a second bearer
// mechanism. sha256(token) — high-entropy random token, NOT a password (no
// bcrypt). `userId` = provenance/revoke/audit, NOT a data-isolation key
// (ingest stays org-shared — see decisions/machines-decomposition.md, Q2).
// ---------------------------------------------------------------------------

export const accessTokens = pgTable(
  "access_token",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Who registered the token. set-null (not cascade): revoking a user must not
    // silently delete the audit trail of tokens they issued.
    userId: text("userId").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // collector | api | mcp
    name: text("name").notNull(),
    prefix: text("prefix").notNull(), // display, non-secret (e.g. "laam_a3f2"; "legacy" for backfilled)
    last4: text("last4").notNull(), // display ("----" for backfilled legacy hashes)
    tokenHash: text("tokenHash").notNull(), // sha256(token)
    scopes: jsonb("scopes").$type<string[]>(), // stored now, enforced in later phases (collector = ["ingest"])
    // collector tokens link to the machine they push for; cascade so deleting a
    // machine removes its tokens.
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

export type AccessToken = typeof accessTokens.$inferSelect;

// ---------------------------------------------------------------------------
// Chat (Phase 4) — per-user conversations with the local Gemma 4 model.
// ---------------------------------------------------------------------------

export const chatConversations = pgTable("chat_conversation", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Cuộc trò chuyện mới"),
  model: text("model"),
  // SP-3 Memory: rolling summary + watermark (id message cuối đã summarize).
  summary: text("summary"),
  summarizedThroughId: text("summarizedThroughId"),
  // SP-3 Proactive: dedupe per-conversation — alert key -> epoch ms lần nêu cuối.
  proactiveState: jsonb("proactiveState").$type<{ surfaced: Record<string, number> }>(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const chatMessages = pgTable(
  "chat_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversationId")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    // Per-turn token usage from Ollama (prompt_eval_count / eval_count). Set on the
    // assistant message; user rows stay 0. Default 0 so old rows read cleanly.
    tokensIn: integer("tokensIn").notNull().default(0),
    tokensOut: integer("tokensOut").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  // Read path: load a conversation's messages in order (/api/conversations/[id]).
  (t) => [index("chat_message_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

// SP-3 — lưu mỗi lượt tool (tool_call + result) mà orchestrator chạy trong 1 turn.
// chat_message GIỮ NGUYÊN (role 'user'|'assistant'); bảng này tách riêng nên consumer
// hiện có (/api/conversations/[id], ChatClient) không đổi. SP-4 đọc để render.
export const chatToolCalls = pgTable("chat_tool_call", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  conversationId: text("conversationId")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  // assistant message mà lượt tool phục vụ; nullable cho ca câu trả lời rỗng.
  messageId: text("messageId").references(() => chatMessages.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull().default(0),
  name: text("name").notNull(),
  args: jsonb("args"),
  result: jsonb("result"),
  ok: boolean("ok").notNull().default(true),
  bytes: integer("bytes").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

// Connector credentials — per-user, ENCRYPTED at rest (the `secret` column holds
// an AES-256-GCM blob from lib/connectors/crypto, never plaintext). v1 stored
// these in a local mode-600 JSON file; v2 is multi-user so they live per-user in
// Postgres. One row per (user, connector).
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
    secret: text("secret").notNull(), // encrypted JSON blob
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userConnector: unique("connector_user_id").on(t.userId, t.connectorId),
  }),
);

export type ConnectorCredential = typeof connectorCredentials.$inferSelect;

export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type ChatToolCall = typeof chatToolCalls.$inferSelect;

export type SubAgentJson = {
  id: string;
  type: string;
  description: string;
  status: string;
  durationMs: number | null;
};
export type ToolJson = {
  name: string;
  count: number;
  errors: number;
  avgDurationMs: number | null;
};

export type User = typeof users.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type AgentSession = typeof agentSessions.$inferSelect;
export type Project = typeof projects.$inferSelect;

// ---------------------------------------------------------------------------
// Eval (reliability tracking). One row per `npm run eval` run. Populated by
// scripts/eval/persist-run.ts; surfaced by /eval. `dims` is the per-dimension
// aggregate (cheap trend reads); `scores` is the full per-scenario detail.
// ---------------------------------------------------------------------------

// Mirror of the eval's ScenarioScore (scripts/eval/types.ts). Declared here so
// the app never imports from scripts/eval — the JSONB shape IS the contract.
export type EvalScenarioScore = {
  id: string;
  capability: string;
  runs: number;
  perDim: Record<string, { passed: number; total: number }>;
  fails: string[];
  avgMs: number;
};
export type EvalDims = Record<string, { passed: number; total: number }>;

export const evalRuns = pgTable("eval_run", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ranAt: timestamp("ranAt", { mode: "date" }).notNull().defaultNow(),
  model: text("model").notNull(),
  k: integer("k").notNull().default(1),
  label: text("label"),
  gitSha: text("gitSha"),
  totalScenarios: integer("totalScenarios").notNull().default(0),
  totalRuns: integer("totalRuns").notNull().default(0),
  dims: jsonb("dims").$type<EvalDims>().notNull(),
  scores: jsonb("scores").$type<EvalScenarioScore[]>().notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});
export type EvalRun = typeof evalRuns.$inferSelect;

// ---------------------------------------------------------------------------
// Workflow orchestration (A0) — manual-trigger linear runs. workflow_schedule +
// condition/foreach columns arrive in later phases. graph = 1 JSONB (clone=copy
// 1 row). run.graphSnapshot = kế hoạch tĩnh lúc start (spec PIN-D4a). userId =
// danh tính thực thi (cred per-user). (spec §4.)
// ---------------------------------------------------------------------------

export const workflows = pgTable("workflow", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  graph: jsonb("graph").$type<WorkflowGraph>().notNull(),
  isTemplate: boolean("isTemplate").notNull().default(false),
  status: text("status").notNull().default("draft"), // draft | active | disabled
  version: integer("version").notNull().default(1),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

// G2 (Phase B): recurring schedules. nextRunAt = mốc kế (cron-derived); claim+advance
// trong 1 tx (PIN-D1). missedCount = số slot bỏ qua khi tick trễ (skip-realign). TZ
// lưu để tương lai (v1 nextRunAt tính theo giờ server). catchupPolicy lưu nhưng v1
// luôn fire-one (no backfill). (spec scheduler.)
export const workflowSchedules = pgTable("workflow_schedule", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workflowId: text("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cron: text("cron").notNull(), // 5-field (min hour dom month dow)
  timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
  enabled: boolean("enabled").notNull().default(true),
  catchupPolicy: text("catchupPolicy").notNull().default("skip"), // skip | (backfill hoãn)
  nextRunAt: timestamp("nextRunAt", { mode: "date" }),
  lastRunAt: timestamp("lastRunAt", { mode: "date" }),
  missedCount: integer("missedCount").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const workflowRuns = pgTable(
  "workflow_run",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workflowId: text("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(), // manual | schedule
    status: text("status").notNull().default("queued"), // queued|running|succeeded|failed|cancelled|resumable (P0a)
    dryRun: boolean("dryRun").notNull().default(false), // Test run: connector writes mocked, no real side-effects
    graphSnapshot: jsonb("graphSnapshot").$type<WorkflowGraph>().notNull(),
    context: jsonb("context"),
    error: text("error"),
    // G2: liên kết schedule + slot đã claim. scheduleId set-null khi schedule bị xoá
    // (giữ lịch sử run). unique(scheduleId, scheduledFor) → dedupe pokes đua cùng slot.
    scheduleId: text("scheduleId").references(() => workflowSchedules.id, { onDelete: "set null" }),
    scheduledFor: timestamp("scheduledFor", { mode: "date" }),
    tokensIn: integer("tokensIn").notNull().default(0),
    tokensOut: integer("tokensOut").notNull().default(0),
    costUsd: doublePrecision("costUsd").notNull().default(0),
    startedAt: timestamp("startedAt", { mode: "date" }),
    finishedAt: timestamp("finishedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("workflow_run_schedule_slot").on(t.scheduleId, t.scheduledFor)],
);

export const workflowRunSteps = pgTable("workflow_run_step", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  runId: text("runId").notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
  nodeId: text("nodeId").notNull(),
  parentStepId: text("parentStepId"), // foreach lồng (A2)
  seq: integer("seq").notNull(),
  kind: text("kind").notNull(), // agent|connector|condition|foreach
  status: text("status").notNull(), // running|succeeded|failed|skipped
  input: jsonb("input"),
  output: jsonb("output"),
  error: text("error"),
  tokensIn: integer("tokensIn").notNull().default(0),
  tokensOut: integer("tokensOut").notNull().default(0),
  costUsd: doublePrecision("costUsd").notNull().default(0),
  startedAt: timestamp("startedAt", { mode: "date" }),
  finishedAt: timestamp("finishedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

// P0a: per-node idempotency for durable resume. Deterministic key (runId,nodeId,iterIndex)
// — NOT the harness nonce (audit_log: 10-min window + no unique index, breaks multi-day sleep).
// status 'claimed' = a write was attempted (claim-before-send); 'done' = output recorded.
// iterIndex disambiguates foreach body iterations (engine.ts walkGraph).
export const workflowNodeIdempotency = pgTable(
  "workflow_node_idempotency",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    runId: text("runId").notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
    nodeId: text("nodeId").notNull(),
    iterIndex: integer("iterIndex").notNull().default(0),
    status: text("status").notNull().default("claimed"), // claimed | done
    output: jsonb("output"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("workflow_node_idem_key").on(t.runId, t.nodeId, t.iterIndex)],
);

export type Workflow = typeof workflows.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type WorkflowRunStep = typeof workflowRunSteps.$inferSelect;
export type WorkflowSchedule = typeof workflowSchedules.$inferSelect;
export type WorkflowNodeIdempotency = typeof workflowNodeIdempotency.$inferSelect;
