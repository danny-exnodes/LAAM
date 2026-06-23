-- Hand-authored RAW-SQL migration (pg_trgm extension + GIN trigram indexes).
--
-- Accelerates the global search (lib/search.ts) and laam_search_sessions ILIKE scans —
-- including the new chat-MESSAGE-content search. Trigram (NOT tsvector) is deliberate:
-- LAAM is trilingual (vi/en/zh) and Postgres ships no vi/zh full-text config, whereas
-- pg_trgm `%term%` substring matching is language-agnostic.
--
-- Extensions + operator-class indexes can't be expressed in Drizzle's schema diff, so
-- this migration is hand-written and IDEMPOTENT (safe to re-run). It tracks no schema
-- columns, so the 0016 snapshot equals 0015 and `db:generate` stays clean.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_content_trgm_idx" ON "chat_message" USING gin ("content" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_conversation_title_trgm_idx" ON "chat_conversation" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_session_latest_activity_trgm_idx" ON "agent_session" USING gin ("latestActivity" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_session_git_branch_trgm_idx" ON "agent_session" USING gin ("gitBranch" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_name_trgm_idx" ON "project" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_name_trgm_idx" ON "workflow" USING gin ("name" gin_trgm_ops);
