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
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

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

export const agentSessions = pgTable("agent_session", {
  id: text("id").primaryKey(), // Claude sessionId (stable across re-syncs)
  machineId: text("machineId").references(() => machines.id, {
    onDelete: "cascade",
  }),
  projectId: text("projectId").references(() => projects.id, {
    onDelete: "set null",
  }),
  source: text("source").notNull().default("claude"), // claude | local
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
});

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
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const chatMessages = pgTable("chat_message", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  conversationId: text("conversationId")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;

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
