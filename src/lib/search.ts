// Global search (W7 — port of v1 lib/search.js + /api/search).
//
// One query per result group, each capped at GROUP_LIMIT:
//   - sessions:      org-shared (same visibility as /api/events) — matches the
//                     agent's current activity, the project name or the git branch.
//   - conversations: the caller's chat conversations only (title match).
//   - workflows:     the caller's workflows only (name match).
//
// Plain ILIKE is enough at the current scale (single team, thousands of rows).
// If it ever gets slow, the upgrade path is a pg_trgm GIN index on the matched
// columns — no API change needed here.

import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { db as appDb } from "@/db";
import { agentSessions, chatConversations, projects, workflows } from "@/db/schema";

export type Db = typeof appDb;

const GROUP_LIMIT = 20;
const MIN_QUERY_LEN = 2;

export type SearchSessionHit = {
  id: string;
  projectName: string | null;
  status: string | null;
  latestActivity: string | null;
  lastActivity: string | null; // ISO
};
export type SearchConversationHit = {
  id: string;
  title: string;
  updatedAt: string | null; // ISO
};
export type SearchWorkflowHit = {
  id: string;
  name: string;
  status: string;
  updatedAt: string | null; // ISO
};
export type SearchResults = {
  sessions: SearchSessionHit[];
  conversations: SearchConversationHit[];
  workflows: SearchWorkflowHit[];
};

const EMPTY: SearchResults = { sessions: [], conversations: [], workflows: [] };

/** Escape LIKE/ILIKE wildcards so user input matches literally ("100%" ≠ "100<anything>"). */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function searchAll(database: Db, q: string, userId: string): Promise<SearchResults> {
  const term = q.trim();
  if (term.length < MIN_QUERY_LEN) return EMPTY;
  const pattern = `%${escapeLike(term)}%`;

  const sessionRows = await database
    .select({
      id: agentSessions.id,
      projectName: projects.name,
      status: agentSessions.status,
      latestActivity: agentSessions.latestActivity,
      lastActivity: agentSessions.lastActivity,
    })
    .from(agentSessions)
    .leftJoin(projects, eq(agentSessions.projectId, projects.id))
    .where(
      or(
        ilike(agentSessions.latestActivity, pattern),
        ilike(projects.name, pattern),
        ilike(agentSessions.gitBranch, pattern),
      ),
    )
    .orderBy(desc(agentSessions.lastActivity))
    .limit(GROUP_LIMIT);

  const conversationRows = await database
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      updatedAt: chatConversations.updatedAt,
    })
    .from(chatConversations)
    .where(and(eq(chatConversations.userId, userId), ilike(chatConversations.title, pattern)))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(GROUP_LIMIT);

  const workflowRows = await database
    .select({
      id: workflows.id,
      name: workflows.name,
      status: workflows.status,
      updatedAt: workflows.updatedAt,
    })
    .from(workflows)
    .where(and(eq(workflows.userId, userId), ilike(workflows.name, pattern)))
    .orderBy(desc(workflows.updatedAt))
    .limit(GROUP_LIMIT);

  return {
    sessions: sessionRows.map((r) => ({
      id: r.id,
      projectName: r.projectName,
      status: r.status,
      latestActivity: r.latestActivity,
      lastActivity: r.lastActivity ? r.lastActivity.toISOString() : null,
    })),
    conversations: conversationRows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    })),
    workflows: workflowRows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    })),
  };
}
